import React, { useState } from "react";
import { View, Text } from "react-native";
import type { ProductRequest } from "@poold/contracts";
import { api, post } from "../api";
import { Button, Field, ErrorText, styles, useAction, C } from "./ui";

const STATUS: Record<ProductRequest["status"], string> = {
  open: "",
  added: "Added to the group",
  declined: "Not added this time",
};

/** A form to suggest a product. Used community-wide and inside a group. */
export function RequestForm({
  path,
  onDone,
  submitLabel = "Suggest product",
  placeholder = "Frozen blueberries",
}: {
  path: string;
  onDone: () => Promise<void>;
  submitLabel?: string;
  placeholder?: string;
}) {
  const a = useAction(),
    [name, setName] = useState(""),
    [note, setNote] = useState("");
  return (
    <View style={{ gap: 10 }}>
      <Field
        label="Product"
        value={name}
        onChangeText={setName}
        placeholder={placeholder}
      />
      <Field
        label="Details (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Brand, size, how much you’d take"
        multiline
      />
      <ErrorText message={a.error} />
      <Button
        disabled={a.busy || !name.trim()}
        onPress={() =>
          void a.run(async () => {
            await post(path, { name, note });
            setName("");
            setNote("");
            await onDone();
          })
        }
      >
        {submitLabel}
      </Button>
    </View>
  );
}

/**
 * One request. The person who made it can edit or delete it until someone
 * responds; everyone else can add their interest.
 */
export function RequestCard({
  request: q,
  refresh,
  showTarget = true,
  canVote = true,
  children,
}: {
  request: ProductRequest;
  refresh: () => Promise<void>;
  showTarget?: boolean;
  /** False for the organizer, who answers requests instead of voting. */
  canVote?: boolean;
  /** Extra actions, e.g. the organizer's Add / Decline buttons. */
  children?: React.ReactNode;
}) {
  const a = useAction(),
    [editing, setEditing] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [name, setName] = useState(q.name),
    [note, setNote] = useState(q.note);
  const open = q.status === "open";
  return (
    <View style={[styles.section, { gap: 8 }]}>
      {editing ? (
        <>
          <Field label="Product" value={name} onChangeText={setName} />
          <Field
            label="Details (optional)"
            value={note}
            onChangeText={setNote}
            multiline
          />
          <ErrorText message={a.error} />
          <View style={[styles.row, { gap: 8 }]}>
            <View style={{ flex: 1 }}>
              <Button
                disabled={a.busy || !name.trim()}
                onPress={() =>
                  void a.run(async () => {
                    await api(`/requests/${q.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ name, note }),
                    });
                    setEditing(false);
                    await refresh();
                  })
                }
              >
                Save
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                secondary
                onPress={() => {
                  setEditing(false);
                  setName(q.name);
                  setNote(q.note);
                }}
              >
                Cancel
              </Button>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.between}>
            <Text style={[styles.h3, { flex: 1 }]}>{q.name}</Text>
            {q.mine && <Text style={styles.pill}>Yours</Text>}
          </View>
          {!!q.note && <Text style={styles.muted}>{q.note}</Text>}
          <Text style={styles.text}>
            {showTarget
              ? `${q.votes} of ${q.target} interested${q.votes >= q.target ? " · Target reached" : ""}`
              : `${q.votes} interested · asked by ${q.mine ? "you" : q.creatorName}`}
          </Text>
          {!open && (
            <Text
              style={[
                styles.muted,
                { color: q.status === "added" ? C.ink : C.muted },
              ]}
            >
              {STATUS[q.status]}
            </Text>
          )}
          <ErrorText message={a.error} />
          {confirmDelete ? (
            <View style={styles.note}>
              <Text style={styles.text}>Delete this request?</Text>
              <Button
                danger
                disabled={a.busy}
                onPress={() =>
                  void a.run(async () => {
                    await api(`/requests/${q.id}`, { method: "DELETE" });
                    await refresh();
                  })
                }
              >
                Delete request
              </Button>
              <Button secondary onPress={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </View>
          ) : q.mine && open ? (
            <View style={[styles.row, { gap: 8 }]}>
              <View style={{ flex: 1 }}>
                <Button secondary onPress={() => setEditing(true)}>
                  Edit
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button secondary danger onPress={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </View>
            </View>
          ) : (
            open &&
            !q.mine &&
            canVote && (
              <Button
                secondary
                disabled={a.busy}
                onPress={() =>
                  void a.run(async () => {
                    await api(`/requests/${q.id}/vote`, {
                      method: "PUT",
                      body: JSON.stringify({ voted: !q.voted }),
                    });
                    await refresh();
                  })
                }
              >
                {q.voted ? "Remove my interest" : "I want this too"}
              </Button>
            )
          )}
          {children}
        </>
      )}
    </View>
  );
}
