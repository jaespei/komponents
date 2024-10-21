import Backbone from 'backbone';

var ComponentModel = Backbone.Model.extend({
    defaults: {
        cardinality: '[:]'
    },
    /**
     * Initializes the model.
     * 
     * @param {Object} [atts] - The attributes
     * @param {Object} [opts] - Additional options
     *
    initialize: function (atts, opts) {
        this.$util.log('[ComponentModel] initialize(' + JSON.stringify(atts) + ',' + JSON.stringify(opts) + ')');
        this.opts = opts || {};
        this.on('change', function (model, opts) {
            this.$util.log('[ComponentModel] change(' + JSON.stringify(model.changedAttributes()) + ')');
            var changed = model.changedAttributes();
            console.dir(changed);
            if (changed && Object.keys(changed).length > 0) {
                model.dirtyAttributes = model.dirtyAttributes || {};
                _.assign(model.dirtyAttributes, changed);
            }
        });
    }*/

});

export default ComponentModel;