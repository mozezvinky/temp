import { createHash } from "node:crypto";
import { requireServerUser } from "@/lib/server-auth";
import { AGENT_TERMS_VERSION } from "@/lib/agent-program";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { resolveService,MarketplaceError,validId } from "@/lib/marketplace-server";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest,NextResponse } from "next/server";
export async function GET(request:NextRequest){
  try{const user=await requireServerUser(request),db=adminDb();if(!user.profile.agentEnabled)return NextResponse.json({enabled:false});
    const view=request.nextUrl.searchParams.get("view")??"overview",cursor=request.nextUrl.searchParams.get("cursor");
    if(view==="referrals"||view==="earnings"){
      const collection=view==="referrals"?"agentReferrals":"commissionLedger";
      let query=db.collection(collection).where("agentId","==",user.uid).orderBy("__name__").limit(31);if(cursor)query=query.startAfter(validId(cursor));
      const records=await query.get();const docs=records.docs.slice(0,30);
      const states=view==="earnings"&&docs.length?await db.getAll(...docs.map(doc=>db.doc(`commissionStates/${doc.id}`))):[];
      return NextResponse.json({enabled:true,records:docs.map((doc,i)=>({id:doc.id,...doc.data(),...(states[i]?.data()??{})})),nextCursor:records.size>30?docs[29].id:null});
    }
    const [metrics,links,referrals]=await Promise.all([db.doc(`agentMetrics/${user.uid}`).get(),db.collection("agentLinks").where("agentId","==",user.uid).limit(50).get(),db.collection("agentReferrals").where("agentId","==",user.uid).count().get()]);
    return NextResponse.json({enabled:true,metrics:{...metrics.data(),peopleReferred:referrals.data().count},links:links.docs.map(doc=>({id:doc.id,...doc.data()}))});
  }catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
  try{const user=await requireServerUser(request),body=await request.json(),db=adminDb();
    if(body.action==="register"){
      const authUser = await adminAuth().getUser(user.uid);
      if (!authUser.emailVerified || authUser.disabled) throw new MarketplaceError("Verify your email before activating your Agent account.", 403);
      if (body.acceptTerms !== true || body.termsVersion !== AGENT_TERMS_VERSION) throw new MarketplaceError("Accept the current COPIC Agent Terms to continue.", 400);
      await db.runTransaction(async tx => {
        const ref = db.doc(`users/${user.uid}`);
        const [snapshot, referral, attribution] = await Promise.all([tx.get(ref), tx.get(db.doc(`agentReferrals/${user.uid}`)), tx.get(db.doc(`acquisitionAttributions/${user.uid}`))]);
        const profile = snapshot.data();
        if (!profile || profile.isLocked || profile.role === "admin" || profile.roles?.includes("admin")) throw new MarketplaceError("This account cannot become an agent.", 403);
        if (referral.exists || attribution.data()?.sourceType === "agent_referral" || attribution.data()?.agentId) throw new MarketplaceError("This account already has a worker referral relationship. Contact COPIC support before becoming an Agent.", 409);
        if (profile.agentEnabled === true) return;
        tx.update(ref, { agentEnabled: true, agentSince: profile.agentSince ?? FieldValue.serverTimestamp(), agentTermsVersion: AGENT_TERMS_VERSION, agentTermsAcceptedAt: FieldValue.serverTimestamp() });
      });
      return NextResponse.json({success:true});
    }
    if(!user.profile.agentEnabled||user.profile.isLocked)throw new MarketplaceError("Active agent access required.",403);
    if(body.action!=="create_link")throw new MarketplaceError("Unknown agent action.");
    const service=body.service?await resolveService(String(body.service)):null;
    const key=service?service.serviceId:"general";
    // Deterministic owner+service link prevents unlimited duplicate links.
    const ref=db.collection("agentLinks").doc(createHash("sha256").update(`${user.uid}:${key}`).digest("hex").slice(0,40));
    await db.runTransaction(async tx=>{const existing=await tx.get(ref);if(!existing.exists)tx.create(ref,{agentId:user.uid,sourceType:"agent_referral",name:service?`Join COPIC as a ${service.service} worker`:"Join COPIC",...(service??{}),active:true,createdAt:FieldValue.serverTimestamp()});});
    return NextResponse.json({id:ref.id,url:`/join/${ref.id}`});
  }catch(error){return failure(error);}
}
function failure(error:unknown){return NextResponse.json({error:error instanceof MarketplaceError?error.message:"Unable to complete the Agent request. Please sign in again or try later."},{status:error instanceof MarketplaceError?error.status:400});}
