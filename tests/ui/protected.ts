import { useAuth } from "./auth";
export function useProtectedRoute(){return {...useAuth(),isAuthorized:!["unauthorized","guest"].includes(new URLSearchParams(location.search).get("state")??"")};}
export function usePublicOnlyRoute(){return {...useAuth(),shouldRender:true};}
