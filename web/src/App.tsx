import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function App() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-8 p-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-foreground tracking-tight">
          Le<span className="text-primary">finance</span>
        </h1>
        <p className="text-muted-foreground text-lg">
          Controle de finanças familiar — scaffold demo
        </p>
      </div>

      {/* Palette swatches */}
      <div className="flex flex-wrap gap-2 justify-center">
        <Badge className="bg-primary text-primary-foreground">primary #4CAF82</Badge>
        <Badge className="bg-secondary text-secondary-foreground">accent #F5C84C</Badge>
        <Badge className="bg-destructive text-destructive-foreground">danger #E5534B</Badge>
        <Badge className="bg-muted text-muted-foreground border">muted</Badge>
      </div>

      {/* Demo card */}
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader>
          <CardTitle>Nova despesa</CardTitle>
          <CardDescription>Registre uma despesa do mês</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="desc">Descrição</Label>
            <Input id="desc" placeholder="Ex: Aluguel" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="valor">Valor (R$)</Label>
            <Input id="valor" type="number" placeholder="0,00" />
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button className="flex-1">Salvar</Button>
          <Button variant="outline" className="flex-1">Cancelar</Button>
        </CardFooter>
      </Card>

      {/* Button variants */}
      <div className="flex flex-wrap gap-3 justify-center">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="ghost">Ghost</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Tailwind v4 · shadcn/ui · tokens da paleta Lefinance ✓
      </p>
    </div>
  )
}

export default App
