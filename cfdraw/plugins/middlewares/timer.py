from typing import List

from cfdraw.schema.plugins import PluginType
from cfdraw.schema.plugins import IMiddleWare
from cfdraw.schema.plugins import ISocketMessage


class TimerMiddleWare(IMiddleWare):
    @property
    def can_handle_message(self) -> bool:
        return True

    @property
    def subscriptions(self) -> List[PluginType]:
        return [PluginType.FIELDS]

    async def process(self, response: ISocketMessage) -> ISocketMessage:
        self.plugin.elapsed_times.end()
        response.data.elapsedTimes = self.plugin.elapsed_times
        return response


__all__ = [
    "TimerMiddleWare",
]
