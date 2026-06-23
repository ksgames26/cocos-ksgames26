import { _decorator, Component, EventTouch, Node } from "cc";
const { ccclass, property } = _decorator;

class EventTouchNew extends EventTouch {
    public sham?: boolean
}

@ccclass("ViewGroupNesting")
export default class ViewGroupNesting extends Component {
    private events: EventTouch[] = [];

    onLoad() {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchHandle, this, true);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchHandle, this, true);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchHandle, this, true);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchHandle, this, true);
    }

    private onTouchHandle(event: EventTouchNew) {
        if (event.sham || event.simulate || event.target === this.node) return;
        let cancelEvent: EventTouchNew = new EventTouchNew(event.getTouches(), event.bubbles, event.getType());
        cancelEvent.type = event.type;
        cancelEvent.touch = event.touch;
        cancelEvent.sham = true;
        this.events.push(cancelEvent);
    }

    update() {
        if (this.events.length === 0) return;
        for (let index = 0; index < this.events.length; index++) {
            this.node.dispatchEvent(this.events[index]);
        }
        this.events.length = 0;
    }
}