export function usePathname(){return location.pathname;}
export function useRouter(){return {refresh:()=>undefined,push:(path:string)=>location.assign(path),replace:(path:string)=>location.assign(path)};}
export function useSearchParams(){return new URLSearchParams(location.search);}

export function useParams<T>(){return {id:"job-demo"} as T;}
