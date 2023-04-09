import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { Button, useToast } from "@chakra-ui/react";

import { langStore } from "@noli/business";

import type { IInternalTaskPlugin } from "@/types/plugins";
import { themeStore } from "@/stores/theme";
import { importMeta } from "@/actions/importMeta";
import { CFDivider } from "@/components/CFDivider";
import FieldsPlugin from "./FieldsPlugin";

const TaskPlugin = (props: IInternalTaskPlugin) => {
  const { task } = props.pluginInfo;
  const onSubmit = useMemo(() => () => importMeta({ t, lang, type: task }), [task]);

  const t = useToast();
  const lang = langStore.tgt;
  const { textColor } = themeStore.styles;

  return (
    <FieldsPlugin {...props}>
      <CFDivider />
      <Button color={textColor} flexShrink={0} onClick={onSubmit}>
        Submit
      </Button>
    </FieldsPlugin>
  );
};

export default observer(TaskPlugin);
