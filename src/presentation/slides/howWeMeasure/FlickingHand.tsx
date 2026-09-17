import { useId } from 'react'

export function FlickingHand({
  isFlicking,
  onFlick,
}: {
  isFlicking: boolean
  onFlick: () => void
}) {
  const id = useId()
  return (
    <button
      aria-label="Flick the spinning top"
      className={`flicking-hand${isFlicking ? ' flicking-hand--flicking' : ''}`}
      disabled={isFlicking}
      onClick={onFlick}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 720 360">
        <defs>
          <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0" stopColor="#ffdbac" />
            <stop offset="0.6" stopColor="#f5bb8c" />
            <stop offset="1" stopColor="#d98e69" />
          </linearGradient>
          <linearGradient id={`${id}-sleeve`} x2="0" y2="1">
            <stop stopColor="#417eab" />
            <stop offset="1" stopColor="#244766" />
          </linearGradient>
        </defs>
        <g className="flicking-hand__drawing" stroke="#633e35" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
          {/* The forearm continues past the viewport; only the hand is clickable. */}
          <path
            className="flicking-hand__arm"
            fill={`url(#${id}-sleeve)`}
            d="M-1200 153L305 153L311 276L-1200 289Z"
          />
          <path
            fill={`url(#${id}-skin)`}
            d="M299 166C346 171 374 165 406 150C437 135 469 132 491 140C526 151 544 179 548 218C553 249 535 277 510 289C480 304 447 303 421 289C385 272 351 258 302 266Z"
          />
          <path className="flicking-hand__shade" d="M315 247C367 237 400 271 432 280C461 289 491 293 515 277C492 302 452 302 421 289C380 270 350 257 315 260Z" />

          {/* Three folded fingers nest against the palm, below the index. */}
          <g fill={`url(#${id}-skin)`}>
            <path d="M477 252C489 244 514 251 524 262C532 273 523 289 509 292C496 295 483 288 478 280" />
            <path d="M491 222C505 213 531 225 539 240C545 252 534 269 519 270C506 269 498 260 496 251" />
            <path d="M504 185C524 179 550 194 554 211C557 228 543 241 529 237C516 233 512 224 512 212" />
          </g>
          <g className="flicking-hand__creases">
            <path d="M512 256L518 261M525 225L533 229M536 201L543 207" />
            <path d="M371 189C365 200 366 214 372 221M396 250C405 265 421 272 434 273" />
          </g>

          {/* Matching curve commands allow a continuous bent-to-straight morph. */}
          <path
            className="flicking-hand__index"
            fill={`url(#${id}-skin)`}
            d="M474 158C471 125 493 102 523 103C551 101 577 113 586 137C592 153 586 175 570 185C558 194 542 188 539 177C536 166 545 158 553 150C549 141 533 136 521 141C513 145 509 153 508 166Z"
          />
          <path
            className="flicking-hand__nail"
            fill="#ffe4c9"
            stroke="#bd856b"
            strokeWidth="2.5"
            d="M544 174C546 166 553 161 560 159C567 161 573 167 573 173C568 183 550 187 544 174Z"
          />

          <g className="flicking-hand__thumb" fill={`url(#${id}-skin)`}>
            <path d="M428 226C434 204 462 191 487 177C510 163 529 158 543 164C557 168 568 180 562 192C557 204 543 206 531 198L511 193C491 210 477 234 453 244" />
            <path className="flicking-hand__creases" d="M492 185C498 185 503 189 507 194M449 223C457 213 465 208 474 204" />
          </g>

          <path fill="#c9e2ed" stroke="#294b65" d="M299 154L324 155L329 271L305 276Z" />
          <path fill="none" stroke="#7da8c3" strokeWidth="3" d="M284 164L287 263" />
          <circle cx="312" cy="251" r="4" fill="#648b9f" stroke="none" />
        </g>
        <g className="flicking-hand__motion-lines">
          <path d="M671 112L688 94M701 131L724 125M699 165L718 177" />
        </g>
      </svg>
    </button>
  )
}
