/*globals define*/
/*eslint-env node, browser*/

/**
 * Generated by PluginGenerator 2.20.5 from webgme on Tue Nov 26 2019 09:00:29 GMT-0600 (Central Standard Time).
 * A plugin that inherits from the PluginBase. To see source code documentation about available
 * properties and methods visit %host%/docs/source/PluginBase.html.
 */

define([
    'plugin/PluginConfig',
    'text!./metadata.json',
    'plugin/PluginBase',
    'text!./Templates/index.html',
    'common/util/ejs',
    'text!./Templates/programjs.ejs'
], function (
    PluginConfig,
    pluginMetadata,
    PluginBase,
    indexHtmlContent,
    ejs,
    programJsTemplate) {
    'use strict';

    pluginMetadata = JSON.parse(pluginMetadata);

    /**
     * Initializes a new instance of PetriNetCodeGenerator.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin PetriNetCodeGenerator.
     * @constructor
     */
    function PetriNetCodeGenerator() {
        // Call base class' constructor.
        PluginBase.call(this);
        this.pluginMetadata = pluginMetadata;
        this.pathToNode = {};
    }

    /**
     * Metadata associated with the plugin. Contains id, name, version, description, icon, configStructure etc.
     * This is also available at the instance at this.pluginMetadata.
     * @type {object}
     */
    PetriNetCodeGenerator.metadata = pluginMetadata;

    // Prototypical inheritance from PluginBase.
    PetriNetCodeGenerator.prototype = Object.create(PluginBase.prototype);
    PetriNetCodeGenerator.prototype.constructor = PetriNetCodeGenerator;

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(Error|null, plugin.PluginResult)} callback - the result callback
     */
    PetriNetCodeGenerator.prototype.main = function (callback) {
        // Use this to access core, project, result, logger etc from PluginBase.
        var self = this,
            artifact,
            nodeObject;


        // // Using the logger.
        // this.logger.debug('This is a debug message.');
        // this.logger.info('This is an info message.');
        // this.logger.warn('This is a warning message.');
        // this.logger.error('This is an error message.');

        // nodeObject = self.activeNode;
        // // Using the coreAPI to make changes.
        // this.core.setAttribute(nodeObject, 'name', 'My new obj');
        // this.core.setRegistry(nodeObject, 'position', {x: 70, y: 70});

        nodeObject =self.activeNode;

        self.core.setRegistry(nodeObject,'position',{x:70,y:70});

        self.extractDataModel()
            .then(function(dataModel){
                var dataModelStr = JSON.stringify(dataModel,null,4);
                self.dataModel = dataModel;

                self.logger.info('Extracted dataModel',dataModelStr);
                
                return self.blobClient.putFile('dataModel.json',dataModelStr);
            })
            .then(function(jsonFileHash){
                var programJS;
                self.logger.info('dataModel.json available with blobHash',jsonFileHash);

                self.result.addArtifact(jsonFileHash);
                
                artifact = self.blobClient.createArtifact('simulator');

                programJS = ejs.render(programJsTemplate,self.dataModel).replace(new RegExp('&quot;','g'),'"');
                self.logger.info('program.js',programJS);

                return artifact.addFilesAsSoftLinks({
                    'program.js':programJS,
                    'index.html':indexHtmlContent
                });
            })
            .then(function(/*hashes*/){
                return artifact.save();
            })
            .then(function (simulatorHash) {
                self.result.addArtifact(simulatorHash);

                self.core.setAttribute(self.activeNode, 'simulator', simulatorHash);
                self.core.setAttribute(self.activeNode, 'simulatorOrigin', self.commitHash);

                return self.save('Added simulator to model');
            })
            .then(function(){
                self.result.setSuccess(true);
                callback(null, self.result);
            })
            .catch(function(err){
                callback(err,self.result);
            });
        // // This will save the changes. If you don't want to save;
        // // exclude self.save and call callback directly from this scope.
        // this.save('PetriNetCodeGenerator updated model.')
        //     .then(() => {
        //         this.result.setSuccess(true);
        //         callback(null, self.result);
        //     })
        //     .catch((err) => {
        //         // Result success is false at invocation.
        //         this.logger.error(err.stack);
        //         callback(err, self.result);
        //     });
    };

    PetriNetCodeGenerator.prototype.extractDataModel = function(callback){
        var self = this,
            dataModel = {
                petriNet : {
                    name :'',
                    initialPlace: null,
                    places : [],
                    transitions : []
                }
            };

        dataModel.petriNet.name = self.core.getAttribute(self.activeNode,'name');

        return this.core.loadSubTree(self.activeNode)
            .then(function(nodes){
                var i, childNode, childName, childrenPaths, childTok;

                for(i =0; i<nodes.length; i+=1){
                    self.pathToNode[self.core.getPath(nodes[i])] =nodes[i];
                }

                childrenPaths = self.core.getChildrenPaths(self.activeNode);
                

                for(i=0;i<childrenPaths.length;i+=1){
                    childNode = self.pathToNode[childrenPaths[i]];

                    childName= self.core.getAttribute(childNode,'name');
                    childTok = self.core.getAttribute(childNode, 'marking');

                    self.logger.info('At childNode ', childName);

                    if(self.isMetaTypeOf(childNode,self.META['BasePlace'])=== true|| self.isMetaTypeOf(childNode,self.META['Place'])){
                        if(childTok > 0){
                            dataModel.petriNet.initialPlace = self.getPlaceData(childNode);
                        }
                        dataModel.petriNet.places.push(self.getPlaceData(childNode));
                    } else if (self.isMetaTypeOf(childNode,self.META['Transition'])=== true){
                        dataModel.petriNet.transitions.push(self.getTransitionData(childNode));
                    } else if(self.isMetaTypeOf(childNode, self.META['Arc']) ===true){
                        if(self.isMetaTypeOf(childNode,self.META['T2P'])===true){

                        }else if (self.isMetaTypeOf(childNode,self.META['P2T'])===true){

                        }
                    } else{
                        self.logger.debug('Child was not of type BasePlace, Transition, or Arc, skipping',childName);
                    }
                }
                return dataModel;
            })
            .nodeify(callback);
    };

    PetriNetCodeGenerator.prototype.getPlaceData = function(placeNode){
        var self = this, 
            placeData = {
                id: '',
                name: '',
                capacity: 0,
                marking: 0,
                arcs :[]
            },
            i,arcNode, arcPaths;
        placeData.name = self.core.getAttribute(placeNode,'name');
        placeData.id = self.core.getPath(placeNode);
        placeData.capacity = self.core.getAttribute(placeNode,'capacity');
        placeData.marking = self.core.getAttribute(placeNode,'marking');

        arcPaths = self.core.getCollectionPaths(placeNode, 'src');

        for(i = 0 ; i < arcPaths.length; i += 1){
            arcNode = self.pathToNode[arcPaths[i]];
            self.logger.info(placeData.name, 'has outgoing arc', arcPaths[i]);
            placeData.arcs.push(self.getArcData(arcNode));
        }

        return placeData;
    };

    PetriNetCodeGenerator.prototype.getTransitionData = function(transNode){
        var self = this,
            transData = {
                id: '',
                name: '',
                passAmount: 0,
                arcs:[]
            },
            i, arcNode, arcPaths;
        transData.name = self.core.getAttribute(transNode,'name');
        transData.id = self.core.getPath(transNode);
        transData.passAmount = self.core.getAttribute(transNode,'passAmount');

        arcPaths  =self.core.getCollectionPaths(transNode,'src');

        for(i = 0 ; i < arcPaths.length; i+=1){
            arcNode = self.pathToNode[arcPaths[i]];
            self.logger.info(transData.name,'has outgoing arc', arcPaths[i]);
            transData.arcs.push(self.getArcData(arcNode));
        }

        return transData;
    };

    PetriNetCodeGenerator.prototype.getArcData = function(arcNode){
        var self = this,
            arcData = {
                targetId: '',
                targetName:'',
                multiplicity:0
            }, targetNode;

        arcData.multiplicity = self.core.getAttribute(arcNode,'multiplicity');

        arcData.targetId = self.core.getPointerPath(arcNode,'dst');

        targetNode = self.pathToNode[arcData.targetId];

        arcData.targetName = self.core.getAttribute(targetNode,'name');

        return arcData;
    };

    return PetriNetCodeGenerator;
});
