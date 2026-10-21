/** Glactivity's mascot. Source artwork lives in design/mascot/squirrel.svg. */
export function Squirrel({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* tail */}
      <path d="M60 104 C 26 104, 12 76, 20 52 C 28 28, 58 22, 64 42 C 68 55, 54 61, 48 52" stroke="#B9652F" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 86 C 22 72, 22 58, 28 48" stroke="#D98A4E" strokeWidth="5" strokeLinecap="round" opacity=".7" />
      {/* body */}
      <ellipse cx="76" cy="90" rx="21" ry="25" fill="#C8743A" />
      <ellipse cx="81" cy="94" rx="12" ry="17" fill="#F3D9B8" />
      {/* ear */}
      <path d="M76 42 C 74 30, 80 24, 86 26 C 90 30, 90 38, 88 44 Z" fill="#B9652F" />
      <path d="M79 40 C 78 33, 81 29, 84 30 C 86 33, 86 37, 85 41 Z" fill="#E7A27A" />
      {/* head */}
      <path d="M64 58 C 64 46, 74 40, 84 41 C 96 42, 104 52, 103 60 C 102 68, 94 72, 84 72 C 72 72, 64 68, 64 58 Z" fill="#C8743A" />
      <ellipse cx="94" cy="63.5" rx="7.5" ry="5" fill="#F3D9B8" />
      <circle cx="102" cy="58" r="2.6" fill="#3A2418" />
      <circle cx="88" cy="54" r="3.4" fill="#2A1A12" />
      <circle cx="89.2" cy="52.8" r="1.1" fill="#FFF8EE" />
      <ellipse cx="80" cy="62" rx="4" ry="2.6" fill="#E98C7A" opacity=".55" />
      {/* acorn */}
      <ellipse cx="94" cy="88" rx="6.5" ry="8" fill="#D9A55B" />
      <path d="M86.5 84 C 87 78, 101 78, 101.5 84 Z" fill="#7A4A2A" />
      <path d="M94 79 L 95 75" stroke="#7A4A2A" strokeWidth="2" strokeLinecap="round" />
      {/* paws */}
      <ellipse cx="88" cy="90" rx="4.5" ry="3.5" fill="#B9652F" />
      <ellipse cx="99" cy="91" rx="4" ry="3.2" fill="#B9652F" />
      {/* feet */}
      <ellipse cx="70" cy="114" rx="8" ry="4" fill="#B9652F" />
      <ellipse cx="88" cy="114" rx="8" ry="4" fill="#B9652F" />
    </svg>
  );
}
