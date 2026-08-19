import { Link, useLocation } from "wouter";
import { 
  BarChart, 
  Store, 
  FlaskConical, 
  ClipboardList, 
  FileText, 
  Settings,
  Menu,
  ClipboardCheck,
  Users,
  LogOut,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/auth-context";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { currentUser, logout } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const allNavItems = [
    { href: "/", label: "Dashboard", icon: BarChart, adminOnly: false },
    { href: "/stores", label: "Stores", icon: Store, adminOnly: true },
    { href: "/chemicals", label: "Chemicals", icon: FlaskConical, adminOnly: true },
    { href: "/inventory", label: "Inventory", icon: ClipboardList, adminOnly: false },
    { href: "/count", label: "Count Submission", icon: ClipboardCheck, adminOnly: false },
    { href: "/reports", label: "AI Reports", icon: FileText, adminOnly: false },
    { href: "/employees", label: "Employees", icon: Users, adminOnly: true },
    { href: "/agent-settings", label: "Agent Settings", icon: Settings, adminOnly: true },
  ];

  const navItems = allNavItems.filter((item) => !item.adminOnly || isAdmin);

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-6">
        <h2 className="text-xl font-bold text-sidebar-primary">RCinventory</h2>
        <p className="text-xs text-sidebar-foreground/60 mt-1 uppercase tracking-wider">Operations Dashboard</p>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                  isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" 
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            {isAdmin
              ? <ShieldCheck className="w-4 h-4 text-sidebar-primary" />
              : <User className="w-4 h-4 text-sidebar-foreground/70" />
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{currentUser?.username}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {isAdmin ? "Admin" : (currentUser?.storeName ?? "Employee")}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent px-2"
          onClick={logout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Mobile Sidebar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-sidebar text-sidebar-foreground flex items-center px-4 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r-0">
            <SidebarContent />
          </SheetContent>
        </Sheet>
        <span className="ml-4 font-bold text-lg text-sidebar-primary">RCinventory</span>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 border-r border-border">
        <SidebarContent />
      </div>

      {/* Main Content */}
      <div className="flex-1 md:ml-64 pt-16 md:pt-0">
        <main className="p-6 max-w-6xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
