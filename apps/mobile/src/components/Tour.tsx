import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { palette as P, type, fonts, brand } from "../theme";
import { getPref, setPref } from "../storage";

/*
 * A spotlight tour: everything goes dark except one part of the screen, with
 * a short note. Tap anywhere for the next one. Runs once after sign-up and can
 * be replayed from Profile. Targets register themselves with <TourTarget>.
 */

type Rect = { x: number; y: number; width: number; height: number };
type Step = { target: string; title: string; text: string };

export const TOUR_STEPS: Step[] = [
  {
    target: "role-switch",
    title: "Two sides of POOLD",
    text: "Buying is for joining groups. Organizing is for running one. Switch here any time.",
  },
  {
    target: "join-button",
    title: "Join a group",
    text: "Pick your shares and save a card. Nothing is charged until shares close, so you can change your mind.",
  },
  {
    target: "tab-home",
    title: "Home",
    text: "Browse groups going to Costco and join one.",
  },
  {
    target: "tab-groups",
    title: "My groups",
    text: "Everything you’ve joined, what you paid, and your pickup code.",
  },
  {
    target: "tab-updates",
    title: "Updates",
    text: "Price changes, refunds and pickup reminders show up here.",
  },
  {
    target: "tab-profile",
    title: "Profile",
    text: "Your details and settings. You can replay this tour from here.",
  },
];

type Measurable = {
  measureInWindow: (
    cb: (x: number, y: number, w: number, h: number) => void,
  ) => void;
};

const Context = createContext<{
  register: (id: string, ref: Measurable | null) => void;
  start: () => void;
}>({ register: () => {}, start: () => {} });

export const useTour = () => useContext(Context);

/** Wrap something the tour can point at. */
export function TourTarget({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { register } = useTour();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    register(id, ref.current as unknown as Measurable);
    return () => register(id, null);
  }, [id]);
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}

const measure = (target: Measurable | undefined) =>
  new Promise<Rect | null>((resolve) => {
    if (!target) return resolve(null);
    try {
      target.measureInWindow((x, y, width, height) =>
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null),
      );
    } catch {
      resolve(null);
    }
  });

export function TourProvider({ children }: { children: React.ReactNode }) {
  const targets = useRef(new Map<string, Measurable>());
  const [index, setIndex] = useState<number | null>(null),
    [rect, setRect] = useState<Rect | null>(null);
  const { width, height } = useWindowDimensions();

  const register = useCallback((id: string, ref: Measurable | null) => {
    if (ref) targets.current.set(id, ref);
    else targets.current.delete(id);
  }, []);

  /** Show step n, skipping any whose target isn't on screen. */
  const show = useCallback(async (n: number) => {
    for (let i = n; i < TOUR_STEPS.length; i++) {
      const r = await measure(targets.current.get(TOUR_STEPS[i].target));
      if (r) {
        setRect(r);
        setIndex(i);
        return;
      }
    }
    setIndex(null);
    setRect(null);
    void setPref("poold.tour", "done");
  }, []);

  const start = useCallback(() => {
    setTimeout(() => void show(0), 600);
  }, [show]);

  const finish = () => {
    setIndex(null);
    setRect(null);
    void setPref("poold.tour", "done");
  };

  // Runs once, right after someone creates an account.
  useEffect(() => {
    void getPref("poold.tour").then((v) => {
      if (v === "pending") setTimeout(() => void show(0), 1500);
    });
  }, [show]);

  const step = index === null ? null : TOUR_STEPS[index];
  const pad = 6;
  const hole = rect && {
    x: Math.max(0, rect.x - pad),
    y: Math.max(0, rect.y - pad),
    w: rect.width + pad * 2,
    h: rect.height + pad * 2,
  };
  const below = hole ? hole.y + hole.h / 2 < height / 2 : true;
  const dim = "rgba(16,16,16,0.72)";
  return (
    <Context.Provider value={{ register, start }}>
      {children}
      <Modal visible={!!step && !!hole} transparent animationType="fade">
        {step && hole && (
          <Pressable
            accessibilityLabel={`${step.title}. ${step.text}. Tap to continue.`}
            accessibilityHint="Shows the next part of the tour"
            onPress={() =>
              index! + 1 < TOUR_STEPS.length ? void show(index! + 1) : finish()
            }
            style={{ flex: 1 }}
          >
            {/* Four dark panels around the spotlight */}
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width,
                height: hole.y,
                backgroundColor: dim,
              }}
            />
            <View
              style={{
                position: "absolute",
                left: 0,
                top: hole.y + hole.h,
                width,
                bottom: 0,
                backgroundColor: dim,
              }}
            />
            <View
              style={{
                position: "absolute",
                left: 0,
                top: hole.y,
                width: hole.x,
                height: hole.h,
                backgroundColor: dim,
              }}
            />
            <View
              style={{
                position: "absolute",
                left: hole.x + hole.w,
                top: hole.y,
                right: 0,
                height: hole.h,
                backgroundColor: dim,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: hole.x,
                top: hole.y,
                width: hole.w,
                height: hole.h,
                borderRadius: 14,
                borderWidth: 2.5,
                borderColor: brand.yellow,
              }}
            />
            <View
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                ...(below
                  ? { top: hole.y + hole.h + 14 }
                  : { bottom: height - hole.y + 14 }),
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxWidth: 380,
                  backgroundColor: P.white,
                  borderRadius: 18,
                  padding: 16,
                  gap: 6,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={[type.mono, { fontSize: 12 }]}>
                    {index! + 1} of {TOUR_STEPS.length}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={finish}
                    hitSlop={10}
                  >
                    <Text
                      style={[type.label, { fontSize: 13, color: P.muted }]}
                    >
                      Skip tour
                    </Text>
                  </Pressable>
                </View>
                <Text style={type.cardTitle}>{step.title}</Text>
                <Text style={type.body}>{step.text}</Text>
                <Text
                  style={{
                    fontFamily: fonts.label,
                    fontSize: 13,
                    color: P.carrot,
                    marginTop: 4,
                  }}
                >
                  {index! + 1 < TOUR_STEPS.length
                    ? "Tap anywhere to continue"
                    : "Tap anywhere to finish"}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      </Modal>
    </Context.Provider>
  );
}
