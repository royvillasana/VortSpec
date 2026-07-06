import logoUrl from "../assets/vortspec-logo.png";

/**
 * The VortSpec brand mark (transparent PNG). Use this anywhere the app icon is
 * needed so the logo stays consistent — the top bar, the startup splash, etc.
 * `size` is the rendered box in px; the image is contained within it.
 */
export function Logo({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <img
      src={logoUrl}
      alt="VortSpec"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
