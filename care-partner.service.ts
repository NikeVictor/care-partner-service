import {
    PartnerCreated,
    PartnerCreatedPayload,
} from "@/events/partnership-created";
import DoesNotExist from "@/exceptions/DoesNotExist.exception";
import {
    Organization,
    OrganizationAttributes,
} from "@/models/organisation.model";
import { ICarePartnerRepo } from "@/repositories/care-partner.repo";
import { IOrganizationRepo } from "@/repositories/organisation.repo";
import { inject, injectable } from "tsyringe";

@injectable()
export class CarePartnerService implements ICarePartnerService {
    constructor(
        @inject("ICarePartnerRepo") private careRepo: ICarePartnerRepo,
        @inject("IOrgRepo") private orgRepo: IOrganizationRepo,
        @inject("PartnerCreated") private partnerCreated: PartnerCreated
    ) {}

    async createPartner(
        orgId: string,
        partnerAttrs: (OrganizationAttributes & { specialties: string[] })[],
        ids?: string[]
    ): Promise<Organization[]> {
        let partners: { invitation: any; partner: Organization }[] = [];

        if (ids) {
            partners = await Promise.all(
                ids.map(async (id) => {
                    const { invitation, partner } =
                        await this.linkExistingOrganization(orgId, id);
                    return { invitation, partner };
                })
            );
        } else {
            partners = await Promise.all(
                partnerAttrs.map(async (attrs) => {
                    const { specialties, ...rest } = attrs;
                    const { invitation, partner } =
                        await this.createNewCarePartner(
                            orgId,
                            rest,
                            specialties
                        );
                    return { invitation, partner };
                })
            );
        }

        const inviter = await this.orgRepo.findOrganizationById(orgId);

        const eventPayload: PartnerCreatedPayload = partners.map((item) => {
            const { invitation, partner } = item;
            return {
                inviter: { id: orgId, name: inviter.name },
                invitationId: invitation.id,
                invited: {
                    id: partner.id,
                    email: partner.emailAddress,
                    name: partner.name,
                },
            };
        });

        this.partnerCreated.dispatch(eventPayload);

        return partners.map((p) => p.partner);
    }

    async linkExistingOrganization(
        inviterId: string,
        partnerId: string,
        specialties: string[] = []
    ) {
        const partner = await this.orgRepo.findOrganizationById(partnerId);
        if (!partner) throw new DoesNotExist("Organization not found");
        const invitation = await this.careRepo.createPartnership(
            inviterId,
            partnerId,
            { specialties }
        );
        return { invitation, partner };
    }

    async createNewCarePartner(
        inviterId: string,
        data: OrganizationAttributes,
        specialties: string[] = []
    ) {
        const { id, ...rest } = data;

        const partner = await this.careRepo.createPartner(inviterId, rest);
        const invitation = await this.careRepo.createPartnership(
            inviterId,
            partner.id,
            { status: "pending", specialties }
        );
        return { invitation, partner };
    }

    async removePartnership(orgId: string, partnerId: string): Promise<void> {
        return this.careRepo.removePartnership(orgId, partnerId);
    }
}
