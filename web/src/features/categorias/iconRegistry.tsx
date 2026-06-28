import {
  Home,
  ShoppingCart,
  Car,
  Utensils,
  Heart,
  Briefcase,
  Coffee,
  GraduationCap,
  Music,
  Plane,
  Zap,
  Tag,
  TrendingUp,
  CreditCard,
  Gift,
  Phone,
  Wifi,
  ShoppingBag,
  Baby,
  Package,
  type LucideProps,
} from 'lucide-react'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'

type LucideIconComponent = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>

/** Ordered list of icon options shown in the icon picker. */
export const ICON_OPTIONS: {
  value: string
  label: string
  Icon: LucideIconComponent
}[] = [
  { value: 'home', label: 'Casa', Icon: Home },
  { value: 'shopping-cart', label: 'Compras', Icon: ShoppingCart },
  { value: 'utensils', label: 'Alimentação', Icon: Utensils },
  { value: 'car', label: 'Transporte', Icon: Car },
  { value: 'heart', label: 'Saúde', Icon: Heart },
  { value: 'briefcase', label: 'Trabalho', Icon: Briefcase },
  { value: 'coffee', label: 'Café / Lazer', Icon: Coffee },
  { value: 'graduation-cap', label: 'Educação', Icon: GraduationCap },
  { value: 'music', label: 'Música', Icon: Music },
  { value: 'plane', label: 'Viagem', Icon: Plane },
  { value: 'zap', label: 'Energia / Tech', Icon: Zap },
  { value: 'tag', label: 'Outros', Icon: Tag },
  { value: 'trending-up', label: 'Investimento', Icon: TrendingUp },
  { value: 'credit-card', label: 'Cartão', Icon: CreditCard },
  { value: 'gift', label: 'Presente', Icon: Gift },
  { value: 'phone', label: 'Telefone', Icon: Phone },
  { value: 'wifi', label: 'Internet', Icon: Wifi },
  { value: 'shopping-bag', label: 'Roupas', Icon: ShoppingBag },
  { value: 'baby', label: 'Filhos', Icon: Baby },
  { value: 'package', label: 'Pacote', Icon: Package },
]

/** Map from icon name to component for quick lookup. */
export const ICON_MAP: Record<string, LucideIconComponent> = Object.fromEntries(
  ICON_OPTIONS.map(({ value, Icon }) => [value, Icon]),
)
