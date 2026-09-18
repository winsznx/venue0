/** Line icons at 20px, 1.6 stroke, matching the inspiration's rail. */
type P = { size?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });
export const IconHome = ({ size = 20 }: P) => <svg {...base(size)}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>;
export const IconWallet = ({ size = 20 }: P) => <svg {...base(size)}><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></svg>;
export const IconCircles = ({ size = 20 }: P) => <svg {...base(size)}><circle cx="8" cy="9" r="3.5" /><circle cx="16" cy="9" r="3.5" /><circle cx="12" cy="16" r="3.5" /></svg>;
export const IconRound = ({ size = 20 }: P) => <svg {...base(size)}><path d="M12 4a8 8 0 1 1-7.4 5" /><path d="M4 4v5h5" /></svg>;
export const IconShield = ({ size = 20 }: P) => <svg {...base(size)}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>;
export const IconArrow = ({ size = 18 }: P) => <svg {...base(size)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconCheck = ({ size = 16 }: P) => <svg {...base(size)} strokeWidth={2.2}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IconExternal = ({ size = 14 }: P) => <svg {...base(size)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
