const {Disposable, CompositeDisposable, Emitter} = require('via');
const _ = require('underscore-plus');
const base = 'via://watchlist';
const etch = require('etch');
const $ = etch.dom;
const ViaTable = require('via-table');

module.exports = class Watchlist {
    static deserialize({omnibar}, state){
        return new Watchlist({omnibar}, state);
    }

    serialize(){
        return {
            deserializer: 'Watchlist',
            uri: this.getURI(),
            selected: this.selected ? this.rows.indexOf(this.selected) : null,
            rows: this.rows.map(row => {
                if(row.type === 'separator'){
                    return {type: 'separator'};
                }else{
                    return {type: 'market', market: row.market.id};
                }
            })
        };
    }

    constructor({omnibar}, state = {}){
        this.disposables = new CompositeDisposable();
        this.emitter = new Emitter();
        this.omnibar = omnibar;
        this.selected = state.selected || null;
        this.rows = [];

        this.columns = [
            {
                name: 'market',
                title: 'Market',
                default: true,
                element: row => {
                    return $.div({classList: 'td market-title', onClick: () => this.change(row)},
                        $.div({classList: 'title'}, row.market ? row.market.title : '')
                    );
                }
            },
            {
                name: 'price',
                title: 'Last Price',
                default: true,
                classes: 'number',
                accessor: row => row.market ? row.market.ticker.last().toFixed(row.market.precision.price) : ''
            },
            {
                name: 'bid-price',
                title: 'Bid Price',
                default: true,
                classes: 'bid-price number',
                accessor: row => row.market ? row.market.quotes.last().bid.price.toFixed(row.market.precision.price) : ''
            },
            {
                name: 'bid-size',
                title: 'Bid Size',
                default: false,
                classes: 'bid-size number',
                accessor: row => row.market ? row.market.quotes.last().bid.size.toFixed(row.market.precision.amount) : ''
            },
            {
                name: 'ask-price',
                title: 'Ask Price',
                default: true,
                classes: 'ask-price number',
                accessor: row => row.market ? row.market.quotes.last().ask.price.toFixed(row.market.precision.price) : ''
            },
            {
                name: 'ask-size',
                title: 'Ask Size',
                default: false,
                classes: 'ask-size number',
                accessor: row => row.market ? row.market.quotes.last().ask.size.toFixed(row.market.precision.amount) : ''
            },
            {
                name: 'spread',
                title: 'Spread',
                default: true,
                classes: 'spread number',
                accessor: row => row.market ? row.market.quotes.spread().toFixed(row.market.precision.price) : ''
            },
            {
                name: 'base-exposure',
                title: 'Exposure (Base)',
                default: true,
                classes: 'base-exposure number',
                accessor: row => {
                    if(!row.market || !row.market.exchange.config.trading) return '';

                    const accounts = via.accounts.exchange(row.market.exchange);
                    const position = accounts.reduce((sum, account) => account.asset(row.market.base), 0);

                    return position.toFixed(row.market.precision.amount) + ' ' + row.market.base;
                }
            },
            {
                name: 'quote-exposure',
                title: 'Exposure (Quote)',
                default: true,
                classes: 'quote-exposure number',
                accessor: row => {
                    if(!row.market || !row.market.exchange.config.trading) return '';

                    const accounts = via.accounts.exchange(row.market.exchange);
                    const position = accounts.reduce((sum, account) => account.asset(row.market.quote), 0);

                    return position.toFixed(row.market.precision.price) + ' ' + row.market.quote;
                }
            }
        ];

        etch.initialize(this);
        this.initialize(state);
    }

    async initialize(state){
        //TODO There is technically an obvious race condition that can occur here.
        //If the interface is re-serialized before markets are initialized, then it will serialize using the empty rows array from above
        await via.markets.initialize();

        if(state.rows){
            for(const row of state.rows){
                if(row.type === 'market'){
                    const market = via.markets.get(row.market);

                    this.rows.push({
                        type: 'market',
                        market,
                        subscriptions: new CompositeDisposable(
                            market.ticker.subscribe(this.update.bind(this)),
                            market.quotes.subscribe(this.update.bind(this))
                        )
                    });
                }else{
                    this.rows.push({type: 'separator'});
                }
            }
        }

        await via.accounts.initialize();

        while(this.rows.length < 40){
            this.rows.push({type: 'separator'});
        }

        this.disposables.add(via.accounts.onDidUpdateAccountPosition(this.update.bind(this)));
        this.disposables.add(via.accounts.onDidAddAccount(this.update.bind(this)));
        this.disposables.add(via.accounts.onDidDestroyAccount(this.update.bind(this)));

        this.disposables.add(via.commands.add(this.element, {
            'watchlist:clear-market': this.clearMarket.bind(this),
            'watchlist:delete-row': this.deleteRow.bind(this),
            'watchlist:insert-row-above': this.insertRowAbove.bind(this),
            'watchlist:insert-row-below': this.insertRowBelow.bind(this)
        }));

        this.update();
    }

    properties(row){
        return {
            classList: `tr ${row.market ? 'market' : 'empty'} ${this.selected === row ? 'selected': ''}`,
            onClick: () => this.select(row),
            dataset: {row: this.rows.indexOf(row)}
        };
    }

    render(){
        return $.div({classList: 'watchlist panel-body'},
            $(ViaTable, {columns: this.columns, data: this.rows, properties: this.properties.bind(this)})
        );
    }

    change(row){
        if(!this.omnibar) return;

        this.omnibar.search({
            name: 'Watch Market',
            placeholder: 'Search For a Market to Display on the Watchlist...',
            didConfirmSelection: selection => this.changeMarket(row, selection.market),
            maxResultsPerCategory: 60,
            items: via.markets.all().filter(m => m.active && m.type === 'SPOT').map(m => ({name: m.title, description: m.description, market: m}))
        });
    }

    update(){
        etch.update(this);
    }

    destroy(){
        if(this.subscription){
            this.subscription.dispose();
        }

        this.emitter.emit('did-destroy');
        this.disposables.dispose();
        this.emitter.dispose();
    }

    consumeActionBar(actionBar){
        this.omnibar = actionBar.omnibar;
    }

    select(row){
        console.log(row.market);
        this.selected = row.market ? row : null;
        this.update();
    }

    deselect(){
        this.selected = null;
    }

    getURI(){
        return base;
    }

    getTitle(){
        return 'Watchlist';
    }

    getMarket(){
        return this.selected;
    }

    changeMarket(row, market){
        if(market === row.market) return;
        if(row.subscription) row.subscription.dispose();

        const insertion = {
            type: 'market',
            market,
            subscriptions: new CompositeDisposable(
                market.ticker.subscribe(this.update.bind(this)),
                market.quotes.subscribe(this.update.bind(this))
            )
        };

        const index = this.rows.indexOf(row);
        this.rows.splice(index, 1, insertion);

        if(index === (this.rows.length - 1)){
            //If this is the last row, add another blank one below it
            this.rows.push({type: 'separator'});
        }

        this.update();
    }

    clearMarket(e){
        const tr = e.target.closest('.tr');

        if(tr && tr.dataset.row){
            const row = this.rows[parseInt(tr.dataset.row)];

            if(row.subscription) row.subscription.dispose();
            this.rows.splice(tr.dataset.row, 1, {type: 'separator'});
            if(this.selected === row) this.deselect();
            this.update();
        }
    }

    insertRowAbove(e){
        const tr = e.target.closest('.tr');

        if(tr && typeof tr.dataset.row !== 'undefined'){
            const row = parseInt(tr.dataset.row);

            this.rows.splice(row, 0, {type: 'separator'});
            this.update();
        }
    }

    insertRowBelow(e){
        const tr = e.target.closest('.tr');

        if(tr && typeof tr.dataset.row !== 'undefined'){
            const row = parseInt(tr.dataset.row);

            this.rows.splice(row + 1, 0, {type: 'separator'});
            this.update();
        }
    }

    deleteRow(e){
        const tr = e.target.closest('.tr');

        if(tr && tr.dataset.row){
            const row = this.rows[parseInt(tr.dataset.row)];

            if(row.subscription) row.subscription.dispose();
            this.rows.splice(tr.dataset.row, 1);
            this.update();
        }
    }

    onDidChangeMarket(callback){
        return this.emitter.on('did-change-market', callback);
    }

    onDidDestroy(callback){
        return this.emitter.on('did-destroy', callback);
    }
}
