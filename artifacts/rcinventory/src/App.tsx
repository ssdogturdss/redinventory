import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import Dashboard from "@/pages/dashboard";
import Stores from "@/pages/stores";
import Chemicals from "@/pages/chemicals";
import Inventory from "@/pages/inventory";
import Reports from "@/pages/reports";
import AgentSettings from "@/pages/agent-settings";
import CountSubmission from "@/pages/count-submission";
import Employees from "@/pages/employees";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AppRoutes() {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  const isAdmin = currentUser.role === "admin";

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        {isAdmin && <Route path="/stores" component={Stores} />}
        {isAdmin && <Route path="/chemicals" component={Chemicals} />}
        <Route path="/inventory" component={Inventory} />
        <Route path="/count" component={CountSubmission} />
        <Route path="/reports" component={Reports} />
        {isAdmin && <Route path="/agent-settings" component={AgentSettings} />}
        {isAdmin && <Route path="/employees" component={Employees} />}
        <Route path="/login"><Redirect to="/" /></Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
