import { useAuth } from "./auth";
export function useProtectedRoute(){return {...useAuth(),isAuthorized:true};}
export function usePublicOnlyRoute(){return {...useAuth(),shouldRender:true};}
