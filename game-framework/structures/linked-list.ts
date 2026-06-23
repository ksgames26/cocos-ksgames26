import { error } from "cc";

/**
 * An interface for linked lists, which shares the common methods.
 */
export interface LinkedList<T> {
    isEmpty(): boolean;
    get(index: number): IGameFramework.Nullable<T>;
    push(data: T): void;
    pop(): IGameFramework.Nullable<T>;
    append(data: T): void;
    removeTail(): IGameFramework.Nullable<T>;
    insertAt(index: number, data: T): void;
    removeAt(index: number): IGameFramework.Nullable<T>;
    clear(): void;
    toArray(): (IGameFramework.Nullable<T>)[];
    getLength(): number;
    getTail(): IGameFramework.Nullable<T>;
    getHead(): IGameFramework.Nullable<T>;
    getTailNode(): IGameFramework.Nullable<ListNode<T>>;
    forEach(cb: (data: T) => boolean, headToTail: boolean): void;
}


/**
 * Represents a node in a doubly linked list.
 *
 * @template T The type of the value stored in the node.
 * @property value The value stored in the node.
 * @property next The next node after this node.
 * @property prev The previous node before this node.
 */
class ListNode<T> {
    constructor(
        public value: T,
        public next?: ListNode<T>,
        public prev?: ListNode<T>
    ) { }
}

/**
 * This is an implementation of a Doubly Linked List.
 * A Doubly Linked List is a data structure that contains a head, tail and length property.
 * Linked Lists consist of nodes, and each node has a value and a pointer to the next and previous node (can be null).
 *
 * @see https://www.geeksforgeeks.org/doubly-linked-list/
 *
 * @template T The type of the value of the nodes.
 * @property head The head of the list.
 * @property tail The tail of the list.
 * @property length The length of the list.
 */
export class DoublyLinkedList<T> implements LinkedList<T> {
    private _head?: ListNode<T> = undefined
    private _tail?: ListNode<T> = undefined
    private _length: number = 0

    /**
     * Checks if the list is empty.
     *
     * @returns {boolean} Whether the list is empty or not.
     */
    isEmpty(): boolean {
        return !this._head
    }

    getTail(): IGameFramework.Nullable<T> {
        return this._tail?.value ?? null;
    }

    getTailNode(): IGameFramework.Nullable<ListNode<T>> {
        return this._tail;
    }

    getHead(): IGameFramework.Nullable<T> {
        return this._head?.value ?? null;
    }

    forEach(cb: (data: T) => boolean, headToTail: boolean): void {
        const index = this._length - 1;

        if (headToTail) {
            let currentNode: ListNode<T> | undefined = this._head;
            if (!currentNode) return;

            if (cb(currentNode.value)) {
                return;
            }
            for (let i: number = 0; i < index; i++) {
                currentNode = currentNode?.next
                if (!currentNode || cb(currentNode.value)) {
                    return;
                }
            }
        } else {
            let currentNode: ListNode<T> | undefined = this._tail;
            if (!currentNode) return;

            if (cb(currentNode.value)) {
                return;
            }
            for (let i: number = 0; i < index; i++) {
                currentNode = currentNode?.prev
                if (!currentNode || cb(currentNode.value)) {
                    return;
                }
            }
        }
    }

    /**
     * Gets a value of a node at a specific index.
     * Time complexity: O(n)
     *
     * @param index The index of the node.
     * @returns The value of a node at the specified index.
     */
    get(index: number): T | null {
        if (index < 0 || index >= this._length) {
            return null
        }

        let currentNode: ListNode<T> | undefined = this._head
        for (let i: number = 0; i < index; i++) {
            currentNode = currentNode?.next
        }

        return currentNode?.value ?? null
    }

    /**
     * Inserts a node at the head of the list.
     * Time complexity: O(1)
     *
     * @param value The value of the node being inserted.
     */
    push(value: T): void {
        const newNode = new ListNode(value)

        if (!this._head) {
            this._head = newNode
            this._tail = newNode
        } else {
            this._head.prev = newNode
            newNode.next = this._head
            this._head = newNode
        }

        this._length++
    }

    /**
     * Removes a node from the head of the list.
     * Time complexity: O(1)
     *
     * @returns The value of the node that was removed.
     * @throws Index out of bounds if the list is empty.
     */
    pop(): T {
        if (!this._head) {
            throw new Error('Index out of bounds')
        }

        const removedNode = this._head

        if (this._head === this._tail) {
            this._tail = undefined
        } else {
            this._head.next!.prev = undefined
        }

        this._head = this._head.next
        this._length--

        return removedNode.value
    }

    /**
     * Inserts a node at the tail of the list.
     * Time complexity: O(1)
     *
     * @param value The value of the node being inserted.
     */
    append(value: T): void {
        const newNode = new ListNode(value)

        if (!this._head) {
            this._head = newNode
        } else {
            this._tail!.next = newNode
            newNode.prev = this._tail
        }

        this._tail = newNode
        this._length++
    }

    /**
     * Removes a node from the tail of the list.
     * Time complexity: O(1)
     *
     * @returns The value of the node that was removed.
     * @throws Index out of bounds if the list is empty.
     */
    removeTail(): T {
        if (!this._head) {
            throw new Error('Index out of bounds')
        }

        const removedNode = this._tail

        if (this._head === this._tail) {
            this._head = undefined
        } else {
            this._tail!.prev!.next = undefined
        }

        this._tail = this._tail!.prev
        this._length--

        return removedNode!.value
    }

    /**
     * Inserts a node at a specific index.
     * Time complexity: O(n)
     *
     * @param index The index where the node will be inserted.
     * @param value The value of the node being inserted.
     * @throws Index out of bounds if the index is not valid.
     */
    insertAt(index: number, value: T): void {
        if (index < 0 || index > this._length) {
            throw new Error('Index out of bounds')
        }

        if (index === 0) {
            this.push(value)
            return
        }

        if (index === this._length) {
            this.append(value)
            return
        }

        const newNode = new ListNode(value)
        let prevNode: ListNode<T> | undefined = this._head
        for (let i: number = 0; i < index - 1; i++) {
            prevNode = prevNode?.next
        }
        const nextNode = prevNode?.next

        prevNode!.next = newNode
        newNode.prev = prevNode
        newNode.next = nextNode
        nextNode!.prev = newNode

        this._length++
    }

    /**
     * Removes a node at a specific index.
     * Time complexity: O(n)
     *
     * @param index The index of the node to be removed.
     * @returns The value of the node that was removed.
     * @throws Index out of bounds if the index is not valid.
     */
    removeAt(index: number): T {
        if (index < 0 || index >= this._length) {
            throw new Error('Index out of bounds')
        }

        if (index === 0) {
            return this.pop()
        }

        if (index === this._length - 1) {
            return this.removeTail()
        }

        let removedNode: ListNode<T> | undefined = this._head
        for (let i: number = 0; i < index; i++) {
            removedNode = removedNode?.next
        }
        removedNode!.prev!.next = removedNode!.next
        removedNode!.next!.prev = removedNode!.prev

        this._length--

        return removedNode!.value
    }

    /**
     * Reverses the list.
     * Time complexity: O(n)
     *
     * @returns The reversed list or null if the list is empty.
     */
    reverse(): DoublyLinkedList<T> | null {
        if (!this._head) {
            return null
        }

        let currentNode: ListNode<T> | undefined = this._head
        let nextNode: ListNode<T> | undefined = undefined
        let prevNode: ListNode<T> | undefined = undefined

        while (currentNode) {
            nextNode = currentNode.next
            prevNode = currentNode.prev

            currentNode.next = prevNode
            currentNode.prev = nextNode

            prevNode = currentNode
            currentNode = nextNode
        }

        this._tail = this._head
        this._head = prevNode

        return this
    }

    /**
     * Clears the list.
     */
    clear(): void {
        this._head = undefined
        this._tail = undefined
        this._length = 0
    }

    /**
     * Converts the list to an array.
     *
     * @returns The array representation of the list.
     */
    toArray(): T[] {
        const array: T[] = []

        let currentNode: ListNode<T> | undefined = this._head

        while (currentNode) {
            array.push(currentNode.value)
            currentNode = currentNode.next
        }

        return array
    }

    /**
     * Gets the length of the list.
     *
     * @returns The length of the list.
     */
    getLength(): number {
        return this._length
    }
}

/**
 * This is an implementation of a (singly) linked list.
 * A linked list is a data structure that stores each element with a pointer (or reference) to the next element
 * in the list. Therefore, it is a linear data structure, which can be resized dynamically during runtime, as there is
 * no fixed memory block allocated.
 *
 * @template T The type of the value of the nodes.
 * @property head The head of the list.
 * @property tail The tail of the list.
 * @property length The length of the list.
 */
export class SinglyLinkedList<T> implements LinkedList<T> {
    private _head?: ListNode<T>
    private _tail?: ListNode<T>
    private _length: number

    /**
     * Creates a new, empty linked list.
     */
    constructor() {
        this._head = undefined
        this._tail = undefined
        this._length = 0
    }

    getTail(): IGameFramework.Nullable<T> {
        return this._tail?.value ?? null;
    }

    getHead(): IGameFramework.Nullable<T> {
        return this._head?.value ?? null;
    }

    getTailNode(): IGameFramework.Nullable<ListNode<T>> {
        return this._tail;
    }

    forEach(cb: (data: T) => boolean, headToTail: boolean): void {
        const index = this._length - 1;

        if (headToTail) {
            let currentNode: ListNode<T> | undefined = this._head;
            if (!currentNode) return;

            if (cb(currentNode.value)) {
                return;
            }
            for (let i: number = 0; i < index; i++) {
                currentNode = currentNode?.next
                if (!currentNode || cb(currentNode.value)) {
                    return;
                }
            }
        } else {
            error(" SinglyLinkedList.forEach() is not implemented for tailToHead")
            return;
        }
    }

    /**
     * Checks, if the list is empty.
     *
     * @returns Whether the list is empty or not.
     */
    isEmpty(): boolean {
        return !this._head
    }

    /**
     * Gets the data of the node at the given index.
     * Time complexity: linear (O(n))
     *
     * @param index The index of the node.
     * @returns The data of the node at the given index or null, if no data is present.
     */
    get(index: number): T | null {
        if (index < 0 || index >= this._length) {
            return null
        }

        if (this.isEmpty()) {
            return null
        }

        let currentNode: ListNode<T> = this._head!
        for (let i: number = 0; i < index; i++) {
            if (!currentNode.next) {
                return null
            }

            currentNode = currentNode.next
        }

        return currentNode.value
    }

    /**
     * Inserts the given data as the first node of the list.
     * Time complexity: constant (O(1))
     *
     * @param data The data to be inserted.
     */
    push(data: T): void {
        const node: ListNode<T> = new ListNode<T>(data)

        if (this.isEmpty()) {
            this._head = node
            this._tail = node
        } else {
            node.next = this._head
            this._head = node
        }

        this._length++
    }

    /**
     * Removes the first node of the list.
     * Time complexity: constant (O(1))
     *
     * @returns The data of the node that was removed.
     * @throws Index out of bounds if the list is empty.
     */
    pop(): T {
        if (this.isEmpty()) {
            throw new Error('Index out of bounds')
        }

        const node: ListNode<T> = this._head!
        this._head = this._head!.next
        this._length--

        return node.value
    }

    /**
     * Inserts the given data as a new node after the current TAIL.
     * Time complexity: constant (O(1))
     *
     * @param data The data of the node being inserted.
     */
    append(data: T): void {
        const node: ListNode<T> = new ListNode<T>(data)

        if (this.isEmpty()) {
            this._head = node
        } else {
            this._tail!.next = node
        }

        this._tail = node
        this._length++
    }

    /**
     * Removes the current TAIL of the list.
     * Time complexity: linear (O(n))
     *
     * @returns The data of the former TAIL.
     * @throws Index out of bounds if the list is empty.
     */
    removeTail(): T {
        if (!this._head) {
            throw new Error('Index out of bounds')
        }

        const currentTail = this._tail
        if (this._head === this._tail) {
            this._head = undefined
            this._tail = undefined
            this._length--

            return currentTail!.value
        }

        let currentNode: ListNode<T> = this._head
        while (currentNode.next !== currentTail) {
            currentNode = currentNode.next!
        }

        this._tail = currentNode
        this._length--

        return currentTail!.value
    }

    /**
     * Inserts the data as a new node at the given index.
     * Time complexity: O(n)
     *
     * @param index The index where the node is to be inserted.
     * @param data The data to insert.
     * @throws Index out of bounds, when given an invalid index.
     */
    insertAt(index: number, data: T): void {
        if (index < 0 || index > this._length) {
            throw new Error('Index out of bounds')
        }

        if (index === 0) {
            this.push(data)

            return
        }

        if (index === this._length) {
            this.append(data)

            return
        }

        const newNode = new ListNode<T>(data)
        let currentNode: ListNode<T> | undefined = this._head
        for (let i: number = 0; i < index - 1; i++) {
            currentNode = currentNode?.next
        }

        const nextNode = currentNode?.next
        currentNode!.next = newNode
        newNode.next = nextNode

        this._length++
    }

    /**
     * Removes the node at the given index.
     * Time complexity: O(n)
     *
     * @param index The index of the node to be removed.
     * @returns The data of the removed node.
     * @throws Index out of bounds, when given an invalid index.
     */
    removeAt(index: number): T {
        if (index < 0 || index >= this._length) {
            throw new Error('Index out of bounds')
        }

        if (index === 0) {
            return this.pop()
        }

        if (index === this._length - 1) {
            return this.removeTail()
        }

        let previousNode: ListNode<T> | undefined
        let currentNode: ListNode<T> | undefined = this._head
        for (let i: number = 0; i < index; i++) {
            if (i === index - 1) {
                previousNode = currentNode
            }

            currentNode = currentNode?.next
        }

        previousNode!.next = currentNode?.next
        this._length--

        return currentNode!.value
    }

    /**
     * Clears the list.
     */
    clear(): void {
        this._head = undefined
        this._tail = undefined
        this._length = 0
    }

    /**
     * Converts the list to an array.
     *
     * @returns The array representation of the list.
     */
    toArray(): T[] {
        const array: T[] = []
        let currentNode: ListNode<T> | undefined = this._head

        while (currentNode) {
            array.push(currentNode.value)
            currentNode = currentNode.next
        }

        return array
    }

    /**
     * Gets the length of the list.
     *
     * @returns The length of the list.
     */
    getLength(): number {
        return this._length
    }
}