// Soft bokeh orbs for any `relative overflow-hidden` section.
export default function BokehBackground({ orbs }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {orbs.map((orb, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left:      orb.x,
            top:       orb.y,
            width:     orb.size,
            height:    orb.size,
            background: orb.color,
            filter:    `blur(${orb.blur}px)`,
            opacity:   orb.opacity,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
}
