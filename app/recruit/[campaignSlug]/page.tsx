import { RecruitmentLanding } from "@/components/profile/RecruitmentLanding";
export default async function RecruitPage({params}:{params:Promise<{campaignSlug:string}>}){const {campaignSlug}=await params;return <RecruitmentLanding id={campaignSlug} type="admin_campaign"/>;}
