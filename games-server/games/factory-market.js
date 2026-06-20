// Factory Market — multiplayer prediction-market game. Slot for the real
// implementation. When its logic is ready, fill in onBothSeated/view/handlers
// (deal the market, expose per-seat state, handle trades/orders) and mount it
// in server.js:  mountGame(io.of('/factory-market'), factoryMarket)
export default {
    onBothSeated(_room) { /* initialise the market here */ },
    view(_room, _seat) { return { game: null }; },
    handlers: {},
};
