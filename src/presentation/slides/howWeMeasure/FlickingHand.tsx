export function FlickingHand({
  isFlicking,
  onFlick,
}: {
  isFlicking: boolean
  onFlick: () => void
}) {
  return (
    <button
      aria-label="Flick the spinning top"
      className={`flicking-hand${isFlicking ? ' flicking-hand--flicking' : ''}`}
      disabled={isFlicking}
      onClick={onFlick}
      type="button"
    >
      <svg aria-hidden="true" role="img" viewBox="0 0 760 330">
        <path
          className="flicking-hand__sleeve"
          d="M-24 132H204L267 231H-24Z"
        />
        <path
          className="flicking-hand__outline"
          d="M166 123C242 112 311 117 367 145C411 167 432 203 412 231C394 256 351 260 309 243L225 213L166 218Z"
        />
        <path
          className="flicking-hand__palm"
          d="M169 131C240 120 307 124 359 150C395 168 413 199 398 220C384 240 351 243 314 229L230 199L169 204Z"
        />

        <g className="flicking-hand__index">
          <path
            className="flicking-hand__finger-outline"
            d="M348 174C426 168 489 137 544 94C575 70 605 51 628 62C653 74 656 103 637 122C596 160 550 192 497 206"
          />
          <path
            className="flicking-hand__finger"
            d="M348 174C426 168 489 137 544 94C575 70 605 51 628 62C653 74 656 103 637 122C596 160 550 192 497 206"
          />
          <path
            className="flicking-hand__nail"
            d="M617 70C630 67 642 77 643 90C644 98 641 105 635 111C628 105 621 97 617 88C615 81 615 75 617 70Z"
          />
        </g>

        <g className="flicking-hand__curled-fingers">
          <path d="M351 196C407 203 455 199 502 181" />
          <path d="M338 215C390 229 440 229 481 211" />
          <path d="M314 229C356 245 400 248 435 235" />
        </g>

        <g className="flicking-hand__thumb">
          <path
            className="flicking-hand__finger-outline"
            d="M290 151C342 158 391 177 433 201C454 213 462 237 448 252C435 266 412 262 392 250C350 226 310 211 271 208"
          />
          <path
            className="flicking-hand__finger"
            d="M290 151C342 158 391 177 433 201C454 213 462 237 448 252C435 266 412 262 392 250C350 226 310 211 271 208"
          />
        </g>

        <g className="flicking-hand__motion-lines">
          <path d="M645 134L687 160" />
          <path d="M631 151L655 188" />
          <path d="M662 115L711 120" />
        </g>
      </svg>
    </button>
  )
}
