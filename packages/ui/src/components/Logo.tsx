import logoUrl from "../assets/vortspec-logo.png";

/**
 * The VortSpec brand mark (transparent PNG). Use this anywhere the app icon is
 * needed so the logo stays consistent — the top bar, the startup splash, etc.
 * `size` is the rendered box in px; the image is contained within it.
 *
 * Pass `alt=""` when the mark sits inside an already-labelled control (the Home
 * crumb, the activity rail's Home item) — otherwise it contributes a second
 * "VortSpec" to the accessibility tree and competes with the real brand mark.
 */
export function Logo({
  size = 18,
  className = "",
  alt = "VortSpec",
}: {
  size?: number;
  className?: string;
  alt?: string;
}): React.JSX.Element {
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
