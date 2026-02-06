import { Music2 } from "lucide-react";

const AudioPlayer = ({ title, src }: { title: string; src?: string | null }) => {
  if (!src) {
    return (
      <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Audio belum tersedia untuk {title}.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-textSecondary">
        <Music2 className="h-4 w-4 text-emerald-600" />
        <span>{title}</span>
      </div>
      <audio className="mt-3 w-full" controls preload="none">
        <source src={src} />
      </audio>
    </div>
  );
};

export default AudioPlayer;
