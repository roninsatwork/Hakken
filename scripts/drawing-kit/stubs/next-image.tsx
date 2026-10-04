// The drawing kit renders parts outside Next: an image is a plain <img>.
import type { ImgHTMLAttributes } from "react";

export default function Image({ unoptimized: _u, priority: _p, fill: _f, ...props }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; priority?: boolean; fill?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element -- the kit renders static HTML for drawings; next/image cannot run here.
  return <img alt="" {...props} />;
}
