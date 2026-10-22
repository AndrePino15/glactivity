import Image from "next/image";

/**
 * The Glactivity squirrel. Painted poses live in public/mascot; the sources and
 * the script that cuts them from the illustration sheet are in design/mascot.
 */
const POSES = {
  standing: { width: 390, height: 420 },
  running: { width: 575, height: 272 },
  stashing: { width: 365, height: 400 },
  lounging: { width: 560, height: 369 },
  snacking: { width: 354, height: 368 },
  celebrating: { width: 425, height: 442 },
} as const;

export type MascotPose = keyof typeof POSES;

/** Renders a pose at the given height, keeping its proportions. */
export function Mascot({
  pose,
  height,
  className,
  preload,
}: {
  pose: MascotPose;
  height: number;
  className?: string;
  preload?: boolean;
}) {
  const source = POSES[pose];
  const width = Math.round((source.width / source.height) * height);
  return (
    <Image
      src={`/mascot/${pose}.webp`}
      alt=""
      width={width}
      height={height}
      className={className}
      preload={preload}
      draggable={false}
    />
  );
}
