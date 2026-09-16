import type { ImgHTMLAttributes } from "react";
export default function Image({fill,unoptimized,...props}:ImgHTMLAttributes<HTMLImageElement>&{fill?:boolean;unoptimized?:boolean}){void fill;void unoptimized;return <img {...props} alt={props.alt??""}/>;}
