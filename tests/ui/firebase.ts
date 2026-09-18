import { user } from "./auth";
export const auth={currentUser:user};
export const db=null;
export const storage=null;
export const functions=null;
export function requireAuth(){return auth;}
export function requireDb(){throw new Error("UI fixtures do not connect to Firestore.");}
export function requireStorage(){throw new Error("UI fixtures do not upload files.");}
export function requireFunctions(){throw new Error("UI fixtures do not call Functions.");}
export async function messaging(){return null;}
export const googleProvider=null;
