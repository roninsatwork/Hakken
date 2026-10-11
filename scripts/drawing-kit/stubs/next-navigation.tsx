// The drawing kit's pretend address: inside Visibility, so the menu and top bar show it.
export const usePathname = () => "/app/sites";
export const useRouter = () => ({ push() {}, replace() {}, back() {}, refresh() {}, prefetch() {} });
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({});
export const redirect = () => {};
export const notFound = () => {};
