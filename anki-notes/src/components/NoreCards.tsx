import { useState } from "react";

type NoteCardsProps = {
  frontNote: string;
  backNote: string;
};

const NoteCards = ({ frontNote, backNote }: NoteCardsProps) => {
  const [side, setSide] = useState<"front" | "back">("front");

  const toggleSide = () => {
    setSide(side === "front" ? "back" : "front");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <div
      onClick={toggleSide}
      className="flex flex-col items-center justify-center gap-6 p-8 cursor-pointer"
    >
      <div className="w-full max-w-md p-8 rounded-2xl shadow-lg bg-white text-center text-xl font-semibold transition-all duration-300">
        {side === "front" ? frontNote : backNote}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleSide();
        }}
        className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition"
      >
        Toggle Side
      </button>
    </div>
  );
};

export default NoteCards;
