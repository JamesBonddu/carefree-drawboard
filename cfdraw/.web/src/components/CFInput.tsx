import { observer } from "mobx-react-lite";
import { Input, InputProps } from "@chakra-ui/react";

import { themeStore } from "@/stores/theme";
import CFTooltip from "./CFTooltip";

interface ICFInput extends InputProps {
  tooltip?: string;
}
function CFInput({ tooltip, ...props }: ICFInput) {
  const { textColor } = themeStore.styles;

  return (
    <CFTooltip label={tooltip}>
      <Input color={textColor} flexShrink={0} {...props} />
    </CFTooltip>
  );
}

export default observer(CFInput);
