import React from "react";
import { Text, View } from "react-native";
import type { ProductRequest } from "@poold/contracts";
import {
  Screen,
  styles,
  useResource,
  ResourceState,
} from "../../components/ui";
import { Collapsible } from "../../components/Sections";
import { RequestCard, RequestForm } from "../../components/RequestList";

export default function Requests() {
  const r = useResource<ProductRequest[]>("/requests");
  const mine = r.data?.filter((q) => q.mine) ?? [];
  const others = r.data?.filter((q) => !q.mine) ?? [];
  return (
    <Screen
      title="What should we share?"
      subtitle="Suggest a product. See who’s interested."
      back
      onRefresh={() => void r.refresh()}
      refreshing={r.loading}
    >
      <View style={styles.note}>
        <Text style={styles.muted}>
          Suggestions help organizers choose items. Reaching the interest target
          suggests a product; it doesn’t promise a purchase. To ask for
          something in a specific group, open that group.
        </Text>
      </View>
      <Collapsible title="Suggest a product" defaultOpen={mine.length === 0}>
        <RequestForm path="/requests" onDone={r.refresh} />
      </Collapsible>
      <ResourceState resource={r} />
      {mine.length > 0 && (
        <View>
          <Text style={styles.pill}>Your suggestions</Text>
          {mine.map((q) => (
            <RequestCard key={q.id} request={q} refresh={r.refresh} />
          ))}
        </View>
      )}
      {others.length > 0 && (
        <View>
          <Text style={styles.pill}>From others</Text>
          {others.map((q) => (
            <RequestCard key={q.id} request={q} refresh={r.refresh} />
          ))}
        </View>
      )}
      {r.data?.length === 0 && (
        <Text style={styles.muted}>Be the first to suggest something.</Text>
      )}
    </Screen>
  );
}
