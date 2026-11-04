import React from "react";
import { Redirect } from "expo-router";

/** Product suggestions now live inside their group; keep old links navigable. */
export default function Requests() {
  return <Redirect href="/(tabs)/my-orders" />;
}
