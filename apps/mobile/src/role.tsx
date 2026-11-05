import React, { createContext, useContext, useEffect, useState } from "react";
import { roles, type Role } from "./theme";
import { getPref, setPref } from "./storage";

/** Home screen for each role. */
export const ROLE_HOME = {
  buying: "/(tabs)/community",
  organizing: "/(tabs)/hub",
} as const;

type RoleState = {
  role: Role;
  colors: (typeof roles)[Role];
  setRole: (role: Role) => void;
};
const Context = createContext<RoleState>({
  role: "buying",
  colors: roles.buying,
  setRole: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("buying");
  useEffect(() => {
    void getPref("poold.role").then((saved) => {
      if (saved === "buying" || saved === "organizing") setRoleState(saved);
    });
  }, []);
  const setRole = (next: Role) => {
    setRoleState(next);
    void setPref("poold.role", next);
  };
  return (
    <Context.Provider value={{ role, colors: roles[role], setRole }}>
      {children}
    </Context.Provider>
  );
}
export const useRole = () => useContext(Context);
