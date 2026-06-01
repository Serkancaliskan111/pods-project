/**
 * Kurumsal ikon registry.
 *
 * Tum UI emoji/pictograph kullanimlari bu dosyadan gelen lucide ikonlara
 * cevrilir. Bir alani guncellerken UI tarafini import { Icon } from '../ui'
 * uzerinden kullanmak ve mumkun oldugunca semantik (TaskComplete, Audit, ...)
 * isimleri tercih etmek isolasyonu korur.
 */
import {
  Plus,
  CheckCircle2,
  XCircle,
  Hourglass,
  Siren,
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  Users,
  Star,
  MessageCircle,
  Bell,
  Megaphone,
  Trophy,
  Eye,
  Target,
  TrendingUp,
  TrendingDown,
  BarChart3,
  UserCircle2,
  User,
  LogOut,
  Settings,
  Mail,
  IdCard,
  Camera,
  Image as ImageIcon,
  Play,
  Paperclip,
  Check,
  CheckCheck,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudSun,
  Snowflake,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Filter,
  Trash2,
  Edit3,
  Send,
  Briefcase,
  Building2,
  Layers,
  Link2,
  GitBranch,
  Flame,
  AlarmClock,
  Clock,
  Calendar,
  Upload,
  Wrench,
  HardHat,
  ChefHat,
  Utensils,
  Truck,
  Stethoscope,
  GraduationCap,
  Headphones,
  ShoppingBag,
  Sparkles,
  Brush,
  Heart,
  Crown,
  CircleUser,
  X,
  PlusCircle,
  RefreshCw,
} from 'lucide-react-native'
import { palette } from './tokens'

/**
 * Semantik ikon takimi. Yeni eleman eklerken: domain yerine niyeti ifade et
 * (TaskComplete > Check; Audit > Eye; Announce > Megaphone). Olası tek bir
 * lucide ikon birden cok niyete denk dusebilir; her niyet icin ayri alias
 * tanimla ki ileride degisirken tek tek update edilebilsin.
 */
export const Icon = {
  // Aksiyon
  TaskAssign: Plus,
  TaskAssignFilled: PlusCircle,
  TaskComplete: CheckCircle2,
  TaskReject: XCircle,
  TaskPending: Hourglass,
  TaskEdit: Edit3,
  TaskDelete: Trash2,
  Send,
  Refresh: RefreshCw,

  // Durum
  Urgent: Siren,
  Warning: AlertTriangle,
  Success: CheckCircle2,
  Error: XCircle,
  Close: X,
  Search,
  Filter: SlidersHorizontal,
  FilterAlt: Filter,

  // Domain
  Tasks: ClipboardList,
  Audit: ShieldCheck,
  AuditAlt: Eye,
  Staff: Users,
  StaffSingle: User,
  Points: Star,
  Chat: MessageCircle,
  News: Bell,
  Announce: Megaphone,
  Leaderboard: Trophy,
  Eye,
  Focus: Target,
  Company: Building2,
  Department: Layers,
  Chain: Link2,
  Branch: GitBranch,

  // Trend / grafik
  TrendUp: TrendingUp,
  TrendDown: TrendingDown,
  Chart: BarChart3,
  Calendar,
  Streak: Flame,
  Sparkle: Sparkles,

  // Zaman
  Clock,
  AlarmClock,

  // Sistem / profil
  Profile: UserCircle2,
  ProfileAlt: CircleUser,
  Logout: LogOut,
  Settings,
  Mail,
  IdCard,
  Briefcase,

  // Medya
  Photo: Camera,
  PhotoAlt: ImageIcon,
  Video: Play,
  Attach: Paperclip,
  Upload,

  // Mesaj durum
  Delivered: Check,
  Read: CheckCheck,

  // Hava
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudSun,
  Snow: Snowflake,

  // Navigasyon
  Back: ChevronLeft,
  Forward: ChevronRight,
  Up: ChevronUp,
  Down: ChevronDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  More: MoreHorizontal,

  // Avatar template ikonlari (avatarTemplates.js icin)
  AvatarManager: Crown,
  AvatarOffice: Briefcase,
  AvatarTech: Wrench,
  AvatarField: HardHat,
  AvatarKitchen: ChefHat,
  AvatarRestaurant: Utensils,
  AvatarLogistics: Truck,
  AvatarHealth: Stethoscope,
  AvatarEducation: GraduationCap,
  AvatarSupport: Headphones,
  AvatarRetail: ShoppingBag,
  AvatarCleaning: Sparkles,
  AvatarBeauty: Brush,
  AvatarCare: Heart,
  AvatarPerson: User,
  AvatarPersonAlt: UserCircle2,
}

/**
 * Default tonlar - dark surface uzerinde acik, light surface uzerinde koyu
 * tercih edilir. Tuketici ekran arkaplanına gore secer.
 */
export const ICON_COLORS = {
  primary: palette.primary[700],
  primaryOnDark: palette.primary[100],
  accent: palette.accent[600],
  accentOnDark: palette.accent[300],
  blurple: palette.blurple[600],
  success: palette.success[600],
  warning: palette.warning[600],
  danger: palette.danger[600],
  slate: palette.slate[600],
  slateOnDark: palette.slate[300],
  white: palette.surface,
}

/**
 * Hava kodundan lucide ikon component'ine cevirici.
 *
 * Open-Meteo weather code haritasini kabaca temsil eder:
 *   0      => guneş
 *   1-3    => az bulutlu / bulutlu
 *   45-48  => sis (cloud)
 *   51-67  => yagmur
 *   71-77  => kar
 *   80-86  => sagnak
 *   95-99  => firtina
 */
export function mapWeatherIcon(code) {
  const n = Number(code)
  if (!Number.isFinite(n)) return Icon.PartlyCloudy || Icon.CloudSun
  if (n === 0) return Icon.Sun
  if (n === 1) return Icon.CloudSun
  if (n === 2) return Icon.CloudSun
  if (n === 3) return Icon.Cloud
  if (n >= 45 && n <= 48) return Icon.Cloud
  if (n >= 51 && n <= 67) return Icon.CloudRain
  if (n >= 71 && n <= 77) return Icon.Snow
  if (n >= 80 && n <= 86) return Icon.CloudRain
  if (n >= 95 && n <= 99) return Icon.CloudLightning
  return Icon.CloudSun
}
