var TemplaterUtils = Class.create();
TemplaterUtils.prototype = {
    initialize: function () {},

    /**
     * True when the viewer may use Templater and an active template targets
     * this table or one it extends — a template for task fits an incident.
     *
     * Used as the condition on the "Export / present" UI actions, so they show
     * only on records something can actually be made from.
     */
    hasTemplatesFor: function (tableName) {
        if (!tableName || !gs.hasRole('x_1040823_template.user')) return false;

        var tables = new GlideTableHierarchy(String(tableName)).getTables();
        var template = new GlideRecord('x_1040823_template_template');
        template.addActiveQuery();
        template.addQuery('table', 'IN', tables.join(','));
        template.setLimit(1);
        template.query();
        return template.hasNext();
    },

    type: 'TemplaterUtils',
};
