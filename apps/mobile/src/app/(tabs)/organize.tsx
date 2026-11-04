import React from "react";
import { Redirect } from "expo-router";
export default function Organize() {
  return (
    <Redirect
      href={{ pathname: "/(tabs)/my-orders", params: { filter: "organizing" } }}
    />
  );
}
