import { RecruitmentLanding } from "@/components/profile/RecruitmentLanding";
export default async function JoinPage({params}:{params:Promise<{linkId:string}>}){const {linkId}=await params;return <RecruitmentLanding id={linkId} type="agent_referral"/>;}
