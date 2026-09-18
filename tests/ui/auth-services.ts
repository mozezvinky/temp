export * from "../../services/auth";
// External sign-out boundary only; the UI still owns the redirect and loading state.
export async function logout() { return undefined; }
