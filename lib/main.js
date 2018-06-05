const {CompositeDisposable, Disposable, Emitter} = require('via');
const base = 'via://watchlist';

const Watchlist = require('./watchlist');

const InterfaceConfiguration = {
    name: 'Watchlist',
    description: 'A live watchlist that tracks your preferred markets.',
    command: 'watchlist:create-watchlist',
    uri: base
};

class WatchlistPackage {
    initialize(){
        this.disposables = new CompositeDisposable();
        this.emitter = new Emitter();
        this.watchlists = [];

        this.disposables.add(via.commands.add('via-workspace', 'watchlist:create-watchlist', () => via.workspace.open(base)));

        this.disposables.add(via.workspace.addOpener((uri, options) => {
            if(uri === base || uri.startsWith(base + '/')){
                const watchlist = new Watchlist({omnibar: this.omnibar}, {uri});

                this.watchlists.push(watchlist);
                this.emitter.emit('did-create-watchlist', watchlist);

                return watchlist;
            }
        }, InterfaceConfiguration));
    }

    deserialize(state){
        const watchlist = Watchlist.deserialize({omnibar: this.omnibar}, state);
        this.watchlists.push(watchlist);
        return watchlist;
    }

    deactivate(){
        this.disposables.dispose();
        this.disposables = null;
    }

    consumeActionBar(actionBar){
        this.omnibar = actionBar.omnibar;

        for(const watchlist of this.watchlists){
            watchlist.consumeActionBar(actionBar);
        }
    }
}

module.exports = new WatchlistPackage();
