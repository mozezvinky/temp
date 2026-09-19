import { requireServerUser } from "@/lib/server-auth";
import { adminDb } from "@/lib/firebase-admin";
import { servicePricing } from "@/lib/service-pricing";
import { pricingLevel } from "@/functions/src/marketplace-policy";
import { NextRequest,NextResponse } from "next/server";
export async function GET(request:NextRequest){try{const user=await requireServerUser(request),name=request.nextUrl.searchParams.get("service")??"";if(!name||name.length>100)return NextResponse.json({error:"Choose a service."},{status:400});const result=await adminDb().runTransaction(async tx=>{const state=await servicePricing(tx,user.uid,name);return {completed:state.completed,policy:state.policy,level:state.policy?pricingLevel(state.completed,!user.profile.isLocked&&user.profile.accountStanding!=="restricted",state.policy):null,initial:state.initial??null};});return NextResponse.json(result);}catch (error) {
    if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });return NextResponse.json({error:error instanceof Error?error.message:"Unable to load pricing."},{status:400});}}
