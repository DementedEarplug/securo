// Category icons, ported from frontend/src/lib/category-icons.ts so both clients
// store and render the same Lucide names. Per-icon imports keep the other ~1,500
// Lucide icons out of the bundle. Labels are the web's search labels.
// Module paths follow Lucide's current file names (building-2 is now
// building-complex, circle-help is circle-question-mark, train is tram-front);
// the stored icon names stay what the web writes.
import type { LucideIcon } from 'lucide-react-native'
import House from 'lucide-react-native/icons/house'
import Lightbulb from 'lucide-react-native/icons/lightbulb'
import Droplets from 'lucide-react-native/icons/droplets'
import Flame from 'lucide-react-native/icons/flame'
import Wifi from 'lucide-react-native/icons/wifi'
import Tv from 'lucide-react-native/icons/tv'
import UtensilsCrossed from 'lucide-react-native/icons/utensils-crossed'
import Coffee from 'lucide-react-native/icons/coffee'
import Beer from 'lucide-react-native/icons/beer'
import Pizza from 'lucide-react-native/icons/pizza'
import Salad from 'lucide-react-native/icons/salad'
import Car from 'lucide-react-native/icons/car'
import Fuel from 'lucide-react-native/icons/fuel'
import Bus from 'lucide-react-native/icons/bus'
import Train from 'lucide-react-native/icons/tram-front'
import Plane from 'lucide-react-native/icons/plane'
import Bike from 'lucide-react-native/icons/bike'
import ShoppingCart from 'lucide-react-native/icons/shopping-cart'
import ShoppingBag from 'lucide-react-native/icons/shopping-bag'
import Gift from 'lucide-react-native/icons/gift'
import Shirt from 'lucide-react-native/icons/shirt'
import Pill from 'lucide-react-native/icons/pill'
import Stethoscope from 'lucide-react-native/icons/stethoscope'
import Syringe from 'lucide-react-native/icons/syringe'
import Cross from 'lucide-react-native/icons/cross'
import Heart from 'lucide-react-native/icons/heart'
import Dumbbell from 'lucide-react-native/icons/dumbbell'
import Gamepad2 from 'lucide-react-native/icons/gamepad-2'
import Music from 'lucide-react-native/icons/music'
import Film from 'lucide-react-native/icons/film'
import PartyPopper from 'lucide-react-native/icons/party-popper'
import Smartphone from 'lucide-react-native/icons/smartphone'
import CreditCard from 'lucide-react-native/icons/credit-card'
import BookOpen from 'lucide-react-native/icons/book-open'
import GraduationCap from 'lucide-react-native/icons/graduation-cap'
import Briefcase from 'lucide-react-native/icons/briefcase'
import Building2 from 'lucide-react-native/icons/building-complex'
import Landmark from 'lucide-react-native/icons/landmark'
import Wallet from 'lucide-react-native/icons/wallet'
import Banknote from 'lucide-react-native/icons/banknote'
import PiggyBank from 'lucide-react-native/icons/piggy-bank'
import TrendingUp from 'lucide-react-native/icons/trending-up'
import TrendingDown from 'lucide-react-native/icons/trending-down'
import Receipt from 'lucide-react-native/icons/receipt'
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right'
import Baby from 'lucide-react-native/icons/baby'
import Dog from 'lucide-react-native/icons/dog'
import Cat from 'lucide-react-native/icons/cat'
import Scissors from 'lucide-react-native/icons/scissors'
import Wrench from 'lucide-react-native/icons/wrench'
import Hammer from 'lucide-react-native/icons/hammer'
import TreePine from 'lucide-react-native/icons/tree-pine'
import Umbrella from 'lucide-react-native/icons/umbrella'
import Globe from 'lucide-react-native/icons/globe'
import Sparkles from 'lucide-react-native/icons/sparkles'
import CircleHelp from 'lucide-react-native/icons/circle-question-mark'

export interface CategoryIconEntry {
  name: string
  label: string
  icon: LucideIcon
}

export const CATEGORY_ICONS: CategoryIconEntry[] = [
  { name: 'house', label: 'Casa / Moradia', icon: House },
  { name: 'lightbulb', label: 'Luz / Energia', icon: Lightbulb },
  { name: 'droplets', label: 'Água', icon: Droplets },
  { name: 'flame', label: 'Gás', icon: Flame },
  { name: 'wifi', label: 'Internet / Wi-Fi', icon: Wifi },
  { name: 'tv', label: 'TV / Streaming', icon: Tv },
  { name: 'utensils-crossed', label: 'Alimentação / Restaurante', icon: UtensilsCrossed },
  { name: 'coffee', label: 'Café', icon: Coffee },
  { name: 'beer', label: 'Bebidas / Bar', icon: Beer },
  { name: 'pizza', label: 'Pizza / Fast Food', icon: Pizza },
  { name: 'salad', label: 'Salada / Saudável', icon: Salad },
  { name: 'car', label: 'Carro / Transporte', icon: Car },
  { name: 'fuel', label: 'Combustível / Gasolina', icon: Fuel },
  { name: 'bus', label: 'Ônibus', icon: Bus },
  { name: 'train', label: 'Trem / Metrô', icon: Train },
  { name: 'plane', label: 'Avião / Viagem', icon: Plane },
  { name: 'bike', label: 'Bicicleta', icon: Bike },
  { name: 'shopping-cart', label: 'Mercado / Supermercado', icon: ShoppingCart },
  { name: 'shopping-bag', label: 'Compras / Loja', icon: ShoppingBag },
  { name: 'gift', label: 'Presente', icon: Gift },
  { name: 'shirt', label: 'Roupa / Vestuário', icon: Shirt },
  { name: 'pill', label: 'Remédio / Farmácia', icon: Pill },
  { name: 'stethoscope', label: 'Médico / Consulta', icon: Stethoscope },
  { name: 'syringe', label: 'Vacina / Exame', icon: Syringe },
  { name: 'cross', label: 'Hospital / Emergência', icon: Cross },
  { name: 'heart', label: 'Saúde / Bem-estar', icon: Heart },
  { name: 'dumbbell', label: 'Academia / Exercício', icon: Dumbbell },
  { name: 'gamepad-2', label: 'Jogos / Lazer', icon: Gamepad2 },
  { name: 'music', label: 'Música', icon: Music },
  { name: 'film', label: 'Cinema / Filme', icon: Film },
  { name: 'party-popper', label: 'Festa / Evento', icon: PartyPopper },
  { name: 'smartphone', label: 'Celular / Telefone', icon: Smartphone },
  { name: 'credit-card', label: 'Cartão de Crédito', icon: CreditCard },
  { name: 'book-open', label: 'Livro / Leitura', icon: BookOpen },
  { name: 'graduation-cap', label: 'Educação / Curso', icon: GraduationCap },
  { name: 'briefcase', label: 'Trabalho / Negócios', icon: Briefcase },
  { name: 'building-2', label: 'Empresa / Escritório', icon: Building2 },
  { name: 'landmark', label: 'Banco / Governo', icon: Landmark },
  { name: 'wallet', label: 'Carteira', icon: Wallet },
  { name: 'banknote', label: 'Dinheiro', icon: Banknote },
  { name: 'piggy-bank', label: 'Poupança / Investimento', icon: PiggyBank },
  { name: 'trending-up', label: 'Rendimento / Lucro', icon: TrendingUp },
  { name: 'trending-down', label: 'Prejuízo / Perda', icon: TrendingDown },
  { name: 'receipt', label: 'Recibo / Nota Fiscal', icon: Receipt },
  { name: 'arrow-left-right', label: 'Transferência', icon: ArrowLeftRight },
  { name: 'baby', label: 'Bebê / Criança', icon: Baby },
  { name: 'dog', label: 'Pet / Cachorro', icon: Dog },
  { name: 'cat', label: 'Pet / Gato', icon: Cat },
  { name: 'scissors', label: 'Cabelo / Beleza', icon: Scissors },
  { name: 'wrench', label: 'Manutenção / Reparo', icon: Wrench },
  { name: 'hammer', label: 'Construção / Reforma', icon: Hammer },
  { name: 'tree-pine', label: 'Natureza / Jardim', icon: TreePine },
  { name: 'umbrella', label: 'Seguro', icon: Umbrella },
  { name: 'globe', label: 'Internacional', icon: Globe },
  { name: 'sparkles', label: 'Especial', icon: Sparkles },
  { name: 'circle-help', label: 'Outros / Indefinido', icon: CircleHelp },
]

export const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICONS.map((entry) => [entry.name, entry.icon]),
)

/** Older data stored an emoji instead of an icon name. */
export function isEmoji(value: string): boolean {
  return value.length <= 2 && /\p{Emoji}/u.test(value)
}
