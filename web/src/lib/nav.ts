import {
  BookHeart,
  BookOpen,
  Heart,
  Home,
  LayoutGrid,
  MoonStar,
  MapPin,
  ScrollText,
  Sparkles,
  Timer,
} from "lucide-react";

export const navItems = [
  {
    label: "Sholat",
    path: "/sholat",
    icon: Timer,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
  },
  {
    label: "Puasa",
    path: "/puasa",
    icon: Sparkles,
    iconColor: "text-sky-600",
    iconBg: "bg-sky-50",
  },
  {
    label: "Zakat",
    path: "/zakat",
    icon: Sparkles,
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
  },
  {
    label: "Haji",
    path: "/haji",
    icon: MapPin,
    iconColor: "text-rose-600",
    iconBg: "bg-rose-50",
  },
  {
    label: "Quran",
    path: "/quran",
    icon: BookOpen,
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
  },
  {
    label: "Murratal",
    path: "/murratal",
    icon: MoonStar,
    iconColor: "text-violet-600",
    iconBg: "bg-violet-50",
  },
  {
    label: "Hadis",
    path: "/hadis",
    icon: ScrollText,
    iconColor: "text-orange-600",
    iconBg: "bg-orange-50",
  },
  {
    label: "Doa",
    path: "/doa",
    icon: Heart,
    iconColor: "text-pink-600",
    iconBg: "bg-pink-50",
  },
  {
    label: "Al\u00A0Matsurat",
    path: "/matsurat",
    icon: BookHeart,
    iconColor: "text-teal-600",
    iconBg: "bg-teal-50",
  },
  {
    label: "Waris",
    path: "/waris",
    icon: LayoutGrid,
    iconColor: "text-slate-600",
    iconBg: "bg-slate-100",
  },
];

export const mobilePrimary = [
  { label: "Home", path: "/", icon: Home },
  { label: "Shalat", path: "/sholat", icon: Timer },
  { label: "Qur'an", path: "/quran", icon: BookOpen },
];
