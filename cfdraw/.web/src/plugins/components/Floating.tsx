import { observer } from "mobx-react-lite";
import { useState, useMemo, forwardRef, useCallback } from "react";
import {
  Box,
  BoxProps,
  CircularProgressProps,
  Flex,
  FlexProps,
  Image,
  Portal,
  TextProps,
} from "@chakra-ui/react";

import { isUndefined } from "@carefree0910/core";
import { langStore, translate } from "@carefree0910/business";

import iconLoading from "@/assets/icon-loading.json";
import type { IFloating } from "@/schema/plugins";
import { Event } from "@/utils/event";
import { BG_TRANSITION, DEFAULT_PLUGIN_SETTINGS, VISIBILITY_TRANSITION } from "@/utils/constants";
import { UI_Words } from "@/lang/ui";
import { themeStore, useScrollBarSx } from "@/stores/theme";
import { settingsStore } from "@/stores/settings";
import {
  usePluginMessage,
  usePluginIsExpanded,
  setPluginExpanded,
  usePluginGroupIsExpanded,
} from "@/stores/pluginsInfo";
import { isInteractingWithBoard } from "@/stores/pointerEvents";
import { parseIStr } from "@/actions/i18n";
import CFText from "@/components/CFText";
import CFLottie from "@/components/CFLottie";
import CFTooltip from "@/components/CFTooltip";
import { CFPendingProgress, CFWorkingProgress } from "@/components/CFCircularProgress";

export function getExpandId(id: string): string {
  return `${id}_expand`;
}

export interface IFloatingIconLoadedEvent {
  id: string;
}
export const floatingIconLoadedEvent = new Event<IFloatingIconLoadedEvent>();

const Floating = forwardRef(function (
  {
    id,
    groupId,
    w: _w, // will not take effect
    h: _h, // will not take effect
    renderInfo: {
      w,
      h,
      iconW,
      iconH,
      pivot,
      follow,
      src,
      tooltip,
      offsetY,
      bgOpacity,
      useModal,
      modalOpacity,
      expandProps,
      isInvisible,
    },
    noExpand,
    onFloatingButtonClick,
    children,
    ...props
  }: IFloating,
  ref,
) {
  const lang = langStore.tgt;
  const taskMessage = usePluginMessage(id);
  const interactingWithBoard = isInteractingWithBoard();
  const expand = usePluginIsExpanded(id);
  const groupExpand = usePluginGroupIsExpanded(groupId);
  const iconActivated = useMemo(
    () => !isInvisible && (isUndefined(groupId) || groupExpand),
    [groupId, groupExpand, isInvisible],
  );
  const [iconLoaded, setIconLoaded] = useState(false);
  const iconLoadingPatience =
    settingsStore.boardSettings?.globalSettings?.iconLoadingPatience ?? 100;
  const isBusy = useMemo(
    () => ["pending", "working"].includes(taskMessage?.status ?? ""),
    [taskMessage?.status],
  );
  const expandId = useMemo(() => getExpandId(id), [id]);
  // styles
  const iconOpacity = useMemo(() => (isBusy ? 0.5 : 1), [isBusy]);
  const {
    panelBg,
    floatingColors: { busyColor },
    lottieColors: { iconLoadingColor },
  } = themeStore.styles;
  bgOpacity ??= DEFAULT_PLUGIN_SETTINGS.bgOpacity;
  const bgOpacityHex = Math.round(bgOpacity * 255).toString(16);
  const getCommonProps = useCallback<(isExpand: boolean) => BoxProps>(
    (isExpand) => ({
      p: isExpand ? "12px" : "8px",
      bg: `${isBusy ? busyColor : panelBg}${bgOpacityHex}`,
      position: "absolute",
      // boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.25)",
      borderRadius: "4px",
      /**
       * if
       *   1. `interactingWithBoard` is `true`
       * or this floating belongs to a group, and:
       *   2. we are focusing on the plugin button (isExpand=false) and the group is not expanded
       *   3. we are focusing on the expanded panel (isExpand=true) but the floating is not expanded
       * then this floating should not be interactive
       */
      pointerEvents:
        interactingWithBoard || (!iconActivated && (!isExpand || !expand)) ? "none" : "auto",
    }),
    [panelBg, busyColor, bgOpacityHex, expand, isBusy, iconActivated, interactingWithBoard],
  );
  //// progress bar props
  const progressProps = useMemo<CircularProgressProps>(() => {
    const size = Math.floor(Math.min(iconW, iconH) * 0.8);
    return {
      size: `${size}px`,
      px: `${0.5 * (iconW - size)}px`,
      py: `${0.5 * (iconH - size)}px`,
    };
  }, [iconW, iconH]);
  //// status caption props
  const statusCaptionProps = useMemo<TextProps>(() => {
    const p = 8;
    const w = 100;
    const defaultTop = "-32px";
    let top, left;
    if (!follow) {
      if (["lt", "top", "rt", "center"].includes(pivot)) {
        top = `${iconH + p}px`;
      } else if (["left", "right"].includes(pivot)) {
        top = "0px";
      } else {
        top = defaultTop;
      }
      if (["lt", "left", "lb"].includes(pivot)) {
        left = `${iconW}px`;
      } else if (["top", "center", "bottom"].includes(pivot)) {
        left = `${0.5 * (iconW - w)}px`;
      } else {
        left = `${-w}px`;
      }
    } else {
      if (
        ["left", "right"].includes(pivot) ||
        (offsetY && ["lt", "rt", "lb", "rb"].includes(pivot))
      ) {
        top = "0px";
        if (!offsetY && !["left", "right"].includes(pivot)) {
          left = `${0.5 * (iconW - w)}px`;
        } else {
          if (["lt", "left", "lb"].includes(pivot)) {
            left = `${-w}px`;
          } else {
            left = `${iconW}px`;
          }
        }
      } else {
        if (["lt", "top", "rt"].includes(pivot)) {
          top = defaultTop;
        } else {
          top = `${iconH + p}px`;
        }
        left = `${0.5 * (iconW - w)}px`;
      }
    }
    return { w: `${w}px`, top, left, position: "absolute" };
  }, [iconW, pivot]);
  const parsedExpandProps: FlexProps = {};
  Object.entries(expandProps ?? {}).forEach(([key, value]) => {
    if (!isUndefined(value) && value !== null) {
      parsedExpandProps[key as keyof FlexProps] = value;
    }
  });
  // convert float to hex
  modalOpacity ??= DEFAULT_PLUGIN_SETTINGS.modalOpacity;
  const modalOpacityHex = Math.round(modalOpacity * 255).toString(16);
  const expandBg = useMemo(
    () => `${panelBg}${useModal ? modalOpacityHex : bgOpacityHex}`,
    [useModal],
  );
  // maintain icon loaded state
  const onIconLoaded = useCallback(() => {
    floatingIconLoadedEvent.emit({ id });
    setIconLoaded(true);
  }, [id]);

  iconLoading.layers.forEach((layer) => {
    if (!layer.shapes) return;
    if (layer.shapes[0].it[1].c?.k) {
      layer.shapes[0].it[1].c.k = iconLoadingColor;
    }
  });
  return (
    <>
      <CFTooltip label={iconActivated ? parseIStr(tooltip ?? "") : ""}>
        <Box
          as="button"
          id={id}
          w={`${iconW}px`}
          h={`${iconH}px`}
          onClick={() => {
            if (!noExpand) {
              setPluginExpanded(id, !expand);
            }
            onFloatingButtonClick?.();
          }}
          opacity={isInvisible ? 0 : 1}
          visibility={isInvisible ? "hidden" : "visible"}
          transition={`${VISIBILITY_TRANSITION}, ${BG_TRANSITION}`}
          {...getCommonProps(false)}
          {...props}>
          <Image
            src={parseIStr(src)}
            w="100%"
            h="100%"
            draggable={false}
            opacity={iconOpacity}
            visibility={iconLoaded ? "visible" : "hidden"}
            transition={VISIBILITY_TRANSITION}
            onLoad={onIconLoaded}
          />
          {taskMessage && isBusy && (
            <Box w={`${iconW}px`} h={`${iconH}px`} position="absolute" left="0px" top="0px">
              {taskMessage.status === "pending" ? (
                <CFPendingProgress
                  {...progressProps}
                  value={(1.0 - taskMessage.pending / Math.max(taskMessage.total, 1)) * 100}
                />
              ) : (
                <CFWorkingProgress
                  {...progressProps}
                  value={(taskMessage.data.progress ?? 0.0) * 100}
                />
              )}
            </Box>
          )}
          {taskMessage && isBusy && isUndefined(groupId) && (
            <CFText {...statusCaptionProps}>
              {translate(
                taskMessage.status === "pending"
                  ? UI_Words["task-pending-caption"]
                  : UI_Words["task-working-caption"],
                lang,
              )}
            </CFText>
          )}
          <CFLottie
            w="100%"
            h="100%"
            position="absolute"
            left="0px"
            top="0px"
            hide={iconLoaded}
            delay={iconLoadingPatience}
            animationData={iconLoading}
          />
        </Box>
      </CFTooltip>
      {!noExpand && (
        <Portal containerRef={ref as any}>
          <Flex
            id={expandId}
            w={`${w}px`}
            h={`${h}px`}
            overflowX="hidden"
            direction="column"
            opacity={expand ? 1 : 0}
            visibility={expand ? "visible" : "hidden"}
            transition={VISIBILITY_TRANSITION}
            {...getCommonProps(true)}
            bg={expandBg}
            sx={useScrollBarSx()}
            {...parsedExpandProps}>
            {children}
          </Flex>
        </Portal>
      )}
    </>
  );
});

export default observer(Floating);
