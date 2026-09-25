export * from "../../services/emailVerification";
// Fixture emails never leave this browser session.
export async function sendRecruitmentVerificationEmail() {
 const code = new URLSearchParams(location.search).get("sendError");
 if (code) throw Object.assign(new Error("Fixture send failure"), { code });
 return undefined;
}
export async function deliverVerificationEmail() {
 try { await sendRecruitmentVerificationEmail(); return { sent:true }; }
 catch { return { error:"Unable to send the verification email. Please try again." }; }
}
