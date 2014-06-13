var elasticsearch = require('elasticsearch');


function Armstrong( config ){
	this.client = new elasticsearch.Client({
		host: config.host, //'localhost:9200',
		log: config.log //'trace'
	});
	
	this.config = { type:'article' };
	for ( var prop in config ) this.config[prop] = config[prop];
	
	/*this.client.indices.create({
		index:this.config.index
	}, function(){
		console.log('index',arguments)
	});*/
	
	this.client.ping({
		// ping usually has a 100ms timeout
		requestTimeout: 1000,
		// undocumented params are appended to the query string
		hello: "elasticsearch!"
	}, function ( err ) {
		if ( err ) return console.warn('elasticsearch cluster is down!');
		//console.trace('All is well');
	});
	
	return this;
}

Armstrong.prototype.map = function( callback ){
	this.client.indices.putMapping({
		index : this.config.index,
		type : this.config.type,
		body : {
			properties : {
				published : { type : "date" },
				views : { type : "integer" }
			}
		}
/*		"tweet" : {
	        "properties" : {
	            "message" : {"type" : "string", "store" : true }
	        }
	    }*/
	}, callback );
};


Armstrong.prototype.suggest = function( term, callback ){
	this.client.suggest({
		index: this.config.index,
		type: this.config.type,
		body: {
			suggest: {
				text : term,
				term : {
					field: 'body',
				}
			/*	simple_phrase : {
					phrase : {
						analyzer : "body",
						field : "bigram",
						size : 1,
						real_word_error_likelihood : 0.95,
						max_errors : 0.5,
						gram_size : 2,
						direct_generator : [
							{
								field : "body",
								suggest_mode : "always",
								min_word_length : 1
							}
						],
						highlight: {
							pre_tag: "<em>",
							post_tag: "</em>"
						}
					}
				}*/
			}
		}
	},callback);
};

Armstrong.prototype.search = function( query, callback ){
	
	var body = query;
	
	if ( typeof body == "string" ) {
		body = {
			query: {
				match: {
					body: query
				}
			}
		};
	}
	
	this.client.search({
		index : this.config.index,
		type : this.config.type,
		body : body
	}).then(function (res) {
		callback( undefined, res, res.hits.hits );
	}, function ( err, res ) {
		console.info(err.message);
		callback( err, res );
	});
	
};

Armstrong.prototype.recent = function( conf, callback ){
	
	this.search({
		sort : [ { published : "desc" } ], // need to figure out a clean way to push mappings to ES
		query: { 
			filtered : {
				query : { match_all:{} },
				filter : {
					and : [
						{ term : { status : 'published' } }
					]
				}
			}
		}
	}, callback );
};

Armstrong.prototype.popular = function( conf, callback ){
	
	this.search({
		sort : [ { views : "desc" } ], // need to figure out a clean way to push mappings to ES
		query: { 
			filtered : {
				query : { match_all:{} },
				filter : {
					and : [
						{ term : { status : 'published' } }
					]
				}
			}
		}
	}, callback );
};

Armstrong.prototype.getDocByUrl = function( url, callback ){
	this.getDocByField( 'url', url, callback );
	this.incrementViewCounter( url );
};

Armstrong.prototype.incrementViewCounter = function( url, callback ){
	this.client.update({
		index : this.config.index,
		type : this.config.type,
		id : url,
		body: {
			script: 'ctx._source.views += views',
			params: { views : 1 }
		}
	}, function ( err, res ) {
		if ( callback ) return callback( err, res );
		if ( err ) console.error(err);
	})
};


Armstrong.prototype.getDocByField = function( field, value, callback ){
	
	var match = {};
	match[field] = value;
	
	this.client.search({
		index : this.config.index,
		type : this.config.type,
		body : {
		//	query: {
		//		match: match
		//	}
			query: { 
				filtered : {
					query : { match:match },
					filter : {
						and : [
							{ term : { status : 'published' } }
						]
					}
				}
			}
		}
	}).then(function (resp) {
		var hits = resp.hits.hits;
		
		callback( undefined, hits[0] );
	}, function (err) {
		callback(err);
	});
	
};


Armstrong.prototype.save = function( doc ){
	var post = {
		index : this.config.index,
		type : this.config.type,
		body : doc
	};
	if ( id ) post.id = id;
	
	this.client.index( post, function ( err, res ) {
		console.log(err,res);
	});
};

Armstrong.prototype.similar = function( id, callback ){
	this.client.mlt({
		index : this.config.index,
		type : this.config.type,
		id : id,
		mlt_fields : 'body'
	}, function ( err, res ) {
		callback( err, res );
	});
};

Armstrong.prototype.index = function( doc, id, callback ){
	// make id optional
	if ( !callback && id instanceof Function ){ callback = id; id = undefined; }
	
	var post = {
		index : this.config.index,
		type : this.config.type,
		consistency : "quorum",
		body : doc,
		indexed : new Date()
	};
	if ( id ) post.id = id;
	
	this.client.index( post, callback );
};

Armstrong.prototype.update = function( doc, id, callback ){
	// make id optional
	if ( !callback && id instanceof Function ){ callback = id; id = undefined; }
	
	doc.updated = new Date();
	
	var post = {
		index : this.config.index,
		type : this.config.type,
		id : id,
		body : {
			doc : doc,
		}
	};
	
	this.client.update( post, callback );
};


Armstrong.prototype.upsert = function( doc, id, callback ){
	var self = this;
	this.update( doc, id, function( err, res ){
		if ( err && err.message.indexOf("DocumentMissingException") > -1 ) {
			doc.views = 0;
			return self.index(doc,id,callback); 
		}
		callback( err, res );
		//if ( err ) return this.insert( doc, id, callback );
	});
};






exports.new = function( config ){
	return new Armstrong( config );
};