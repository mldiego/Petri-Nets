// import { stat } from "fs";

// import { isNull } from "util";
// import { runInThisContext } from "vm";

/*globals define, WebGMEGlobal*/

/**
 * Generated by VisualizerGenerator 1.7.0 from webgme on Tue Nov 26 2019 16:16:48 GMT-0600 (Central Standard Time).
 */

define(['jquery','d3','css!./styles/PetriNetSimWidget.css'], function () {
    'use strict';

    var PLACE_TYPES={
        Place: 'Place',
        Transition:'Transition',
        Arc : 'Arc'
    },WIDGET_CLASS = 'petri-net-sim';

    function PetriNetSimWidget(logger, container) {
        this._logger = logger.fork('Widget');

        this._el = container;

        this.nodes = {};
        this._initialize();
        this._simEl = null;
        this._simulator = null;

        this._logger.debug('ctor finished');
    }

    PetriNetSimWidget.prototype._initialize = function () {
        var width = this._el.width(),
            height = this._el.height(),
            self = this;

        // set widget class
        this._el.addClass(WIDGET_CLASS);

        this._headerEl = $('<h3>');
        this._el.append(this._headerEl);
        this._headerEl.css('color','red');
        // Create a dummy header
        // this._el.append('<h3>PetriNetSim Events:</h3>');

        // // Registering to events can be done with jQuery (as normal)
        // this._el.on('dblclick', function (event) {
        //     event.stopPropagation();
        //     event.preventDefault();
            // self.onBackgroundDblClick();
        // });

        this._inputGroup = $(
            '<div class="input-group">' +
                '<span class="input-group-btn">' +
                    '<button class="btn btn-primary go-btn" type="button">Go!</button>' +
                '</span>' +
                '<input type="text" class="form-control" placeholder="Enter an event...">'+
                '<span class="input-group-btn">' +
                    '<button class="btn btn-warning start-btn" type="button">Initialize</button>'+
                '</span>' +
            '</div>');

        this._el.append(this._inputGroup);

        this._inputField = this._inputGroup.find('input');
        this._goBtn = this._inputGroup.find('.go-btn');
        this._startBtn = this._inputGroup.find('.start-btn');

        this._startBtn.on('click', function(){
            var stateId, stateData, key, helpMessage;

            if(self._simulator === null){
                self._logger.error('Simulator not available at init');
                return;
            }

            for(key in self._idToState){
                stateData = self._idToState[key];
                stateData.desc.marking = self._simulator.getCurrentMarking();
                stateData.d3Item.attr('fill', stateData.defaultColor);
            }

            self._simulator.initialize();
            if(stateId === undefined){
                stateId = self._simulator.getCurrentPlace().id;
                self._idToState[stateId].desc.isInitial = true;
                self._idToState[stateId].desc.isEnd = true;
            }

            stateId = self._simulator.getCurrentPlace().id;
            self._setState(stateId);

            helpMessage = 'Enter an amount: ' + self._simulator.getCurrentMultiplicity();
            self._inputField.attr('placeholder',helpMessage);
            self._inputField.attr('title',helpMessage);

            self._goBtn.prop('disabled',false);
        });
        
        this._goBtn.on('click',function(){
            var prevStateId, stateId, stateData, event, helpMessage,state;

            if(self._simulator ===null){
                self._logger.error('Simulator not available at go');
                return;
            }

            prevStateId = self._simulator.getCurrentPlace().id;
            //tokens = self._simulator.getCurrentPlace().marking;
            //prevStateData.desc.marking = 0;


            event = self._inputField.val();
            self._simulator.enterEvent(event);

            stateId = self._simulator.getCurrentPlace().id;
            //stateData._simulator.setA

            //prevStateData = self._idToState[prevStateId];
            //prevStateData.desc.marking = parseInt(event);
            for(state in self._idToState){
                stateData = self._idToState[state];
                
                if (stateData.desc.marking < parseInt(event) && stateData.desc.metaType === 'Place' && stateData.desc.id === prevStateId){
                    throw 'Not possible to execute this event, as it requires more tokens that currently available. Please proceed by refreshing the page and fix errors in model.';
                }
                //stateData.marking = stateData.marking + parseInt(event);
                //if (stateData.metaType === 'Place'){
                //    stateData.desc.marking = parseInt(event) - stateData.marking;
                //}
                
                stateData.desc.marking = parseInt(event);
                stateData.d3Item.attr('fill', stateData.defaultColor);
                if(stateData.inCircle !==null && stateData.desc.id === stateId){
                    stateData.inCircle.remove('text');
                    if(stateData.isEnd === true){
                        stateData.desc.marking = 1;
                    }
                }
                if(stateData.inCircle !== null && stateData.desc.id === prevStateId){
                    stateData.inCircle.remove('text');
                }
            }


            self._setState(stateId,prevStateId);
            if(self._simulator.atEnd === true){
                helpMessage = 'At an end point, reinitialize the simulator.';
                self._goBtn.prop('disabled',true);
            } else{
                helpMessage = 'Enter an event: '+self._simulator.getCurrentMultiplicity();
            }

            self._inputField.attr('placeholder',helpMessage);
            self._inputField.attr('title', helpMessage);
            self._inputField.val('');
        });

        this._inputGroup.hide();

        this._svgD3 = d3.select(this._el[0]).append('svg').attr('width',width).attr('height',height);
    };

    PetriNetSimWidget.prototype.onWidgetContainerResize = function (width, height) {
        this._logger.debug('Widget is resizing...');

        this._svgD3.attr('width',width).attr('height',height);
    };

    PetriNetSimWidget.prototype.populateGraph = function(petriNetData){
        var key, desc;

        this._logger.debug('petriNetData',petriNetData);
        this._idToState = {};
        this._idToTransition = {};

        for(key in petriNetData.descriptors){
            desc = petriNetData.descriptors[key];
            if(PLACE_TYPES.hasOwnProperty(desc.metaType)||desc.metaType==='BasePlace'){
                this._idToState[key] ={
                    desc:desc,
                    d3Item:null,
                    title:null,
                    defaultColor:null,
                    inCircle:null
                };
            } else if((desc.metaType==='T2P' || desc.metaType==='P2T') && desc.isConnection){
                this._idToTransition[key] = {
                    desc:desc,
                    d3Item:null
                };
            }
        }
        this._addTransitionsToGraph();

        this._addStatesToGraph();

        this._embedSimulator(petriNetData);
    };


    PetriNetSimWidget.prototype._addStatesToGraph = function(){
         var key, stateData;

         for(key in this._idToState){
             stateData = this._idToState[key];

            if(stateData.desc.metaType === PLACE_TYPES.Place || stateData.desc.metaType === 'BasePlace'){
                stateData.d3Item = this._svgD3.append('circle')
                    .attr('cx', stateData.desc.position.x)
                    .attr('cy',stateData.desc.position.y)
                    .attr('r',20)
                    .attr('fill','orange');
                    //.attr('textContent',stateData.marking);
                stateData.defaultColor = 'orange';
                stateData.inCircle = this._svgD3.append('text')
                    .attr('id','markingInCircle')
                    .attr('x', stateData.desc.position.x-5)
                    .attr('y', stateData.desc.position.y+5)
                    .text(function(){
                        return stateData.desc.marking;
                    })
                    .attr('fill','black')
                    .attr('font-size',14);
                    
            } else if(stateData.desc.metaType ===PLACE_TYPES.Transition){
                stateData.d3Item = this._svgD3.append('rect')
                    .attr('x', stateData.desc.position.x-10)
                    .attr('y',stateData.desc.position.y-20)
                    .attr('width',20)
                    .attr('height',40)
                    .attr('fill','black');
                stateData.defaultColor = 'black';
            }
            stateData.title = this._svgD3.append('text')
                .attr('x', stateData.desc.position.x -15)
                .attr('y', stateData.desc.position.y -25)
                .text(function(){
                    return stateData.desc.name;
                })
                .attr('fill','black')
                .attr('font-size', 14);
         }
    };

    PetriNetSimWidget.prototype._addTransitionsToGraph = function(){
        var key, arcData, srcDesc, dstDesc, randColor;

        for(key in this._idToTransition){
            arcData = this._idToTransition[key];

            srcDesc = this._idToState[arcData.desc.connects.srcId].desc;
            dstDesc = this._idToState[arcData.desc.connects.dstId].desc;
            randColor = '#' + ("000000" + Math.random().toString(16).slice(2,8)).slice(-6);
            arcData.d3Item = this._svgD3.append('line')
                .attr('x1',srcDesc.position.x)
                .attr('y1',srcDesc.position.y)
                .attr('x2',dstDesc.position.x)
                .attr('y2',dstDesc.position.y)
                .attr('stroke-width',1)
                .attr('stroke', 'black')
                .attr('marker-end',"url(#arrow)");
            arcData.title = this._svgD3.append('text')
                .attr('x',(Math.abs(dstDesc.position.x + srcDesc.position.x)/2)+10)
                .attr('y',(Math.abs(dstDesc.position.y + srcDesc.position.y)/2)-7)
                .text(function(){
                    return arcData.desc.multiplicity;
                })
                .attr('font-size',12)
                .attr('fill','black');
            arcData.ending = this._svgD3.append('marker')
                .attr('id','arrow')
                .attr('markerWidth',"10")
                .attr('markerHeight',"10")
                .attr('refX',"27.5")
                .attr('refY',"3")
                .attr('orient',"auto")
                .attr('markerUnits',"stroke-width")
                .attr('fill','black');
            arcData.ending.append('path')
                .attr('d',"M0,0 L0,6 L9,3 z")
                .attr('fill','black');
        }
    };

    PetriNetSimWidget.prototype._embedSimulator = function(petriNetData){
        var self = this;
        if(this._simEl === null){
            if(typeof petriNetData.simulatorUrl !== 'string'){
                self._headerEl.text('No simulator is attached.');
                return;
            }

            this._simEl = $('<iframe>',{
                id: 'PetriNetSim',
                src: petriNetData.simulatorUrl,
                width:0,
                height:0
            });

            this._el.append(this._simEl);

            this._simEl.on('load',function(){
                var PetriNet = self._simEl[0].contentWindow.PetriNet;
                if(!PetriNet || PetriNet.hasOwnProperty('Simulator')=== false){
                    self._headerEl.text('Attached simulator not right format.');
                    return;
                }

                self._simulator = new PetriNet.Simulator(self._logger.debug);
                self._logger.debug('Simulator is loaded', self._simulator);

                self._inputGroup.show();
                self._goBtn.prop('disabled',true);
                self._inputField.prop('placeholder','Initialize simulator...');
            });
        }
    };

    PetriNetSimWidget.prototype._setState = function(stateId, prevStateId){
        var newStateData = this._idToState[stateId],
            arcData,prevStateData, delay = 0, key, possStates = [];

        //event = self._inputField.val();  
        // if(newStateData.desc.isEnd === )
        if(prevStateId && prevStateId !==stateId){
            prevStateData =this._idToState[prevStateId];
            prevStateData.d3Item.transition()
                .duration(500)
                .attr('r',10)
                .delay(400)
                .transition()
                .duration(500)
                .attr('r',20)
                .attr('fill',prevStateData.defaultColor);
            delay = 400;
            for(key in this._idToTransition){
                if((this._idToTransition[key].desc.connects.srcId===prevStateId)&& (this._idToTransition[key].desc.connects.dstId===stateId)){
                    arcData = this._idToTransition[key];
                }
            }
            arcData.d3Item.transition()
            .delay(200)
            .duration(500)
            .attr('stroke','red')
            .attr('stroke-width',2)
            .delay(200)
            .transition()
            .duration(500)
            .attr('stroke','black')
            .attr('stroke-width',1);
        }
        
  
        if(prevStateId !== undefined){
            //if (prevStateData.desc.marking > 0 && prevStateData.desc.metaType === 'BasePlace'){
            try{
                if(prevStateData.desc.isInitial===true){
                    possStates.push(d3.selectAll("#markingInCircle"));
                    for(key =0; key<possStates[0][0].length;key+=1){
                        if(possStates[0][0][key].textContent === "1"){
                            possStates[0][0][key].remove();
                        }
                    }
                    // prevStateData.inCircle.text.innerHTML(" ");
                    prevStateData.marking = 0;
                    prevStateData.desc.marking = 0;
                    prevStateData.inCircle.append('text')
                        .attr('x',prevStateData.desc.position.x-5)
                        .attr('y',prevStateData.desc.position.y+5)
                        .text(function(){
                            return prevStateData.marking;
                        })
                        .attr('fill','black');
                } else{
                    prevStateData.marking = 0;
                }

                
            }
            catch(err){
                throw 'Wrong input event. Please restart model and follow instructions on top for the possible input events'
            }
            //}
            //if (prevStateData.desc.metaType === 'Transition'){
            //    prevStateData.inCircle.text('0');
            //}
            if(prevStateData.metaType !== 'Transition'){
                prevStateData.inCircle = this._svgD3.append('text')
                    .attr('x', prevStateData.desc.position.x-5)
                    .attr('y', prevStateData.desc.position.y+5)
                    .text(function(){
                        return prevStateData.marking;
                    })
                    .attr('fill','black');
                    
            }
        }
        

        newStateData.d3Item.transition()
            .delay(delay)
            .duration(300)
            .attr('r',40)
            .delay(400)
            .transition()
            .duration(300)
            .attr('r',20)
            .attr('fill','red');
        
        if(newStateData.desc.metaType !== 'Transition'){

            //newStateData.marking = newStateData.desc.marking + 1;
            
            newStateData.inCircle = this._svgD3.append('text')
                .attr('x', newStateData.desc.position.x-5)
                .attr('y', newStateData.desc.position.y+5)
                .text(function(){
                    return newStateData.desc.marking;
                })
                .attr('fill','black');
                
        }

        
            
            
    };
    // Adding/Removing/Updating items
    PetriNetSimWidget.prototype.addNode = function (desc) {
        this._headerEl.text('Current model may have changed.');
    };

    PetriNetSimWidget.prototype.removeNode = function (gmeId) {
        this._headerEl.text('Current model may have changed.');
    };

    PetriNetSimWidget.prototype.updateNode = function (desc) {
        this._headerEl.text('Current model may have changed.');
    };

    /* * * * * * * * Visualizer event handlers * * * * * * * */

    PetriNetSimWidget.prototype.onNodeClick = function (/*id*/) {
        // This currently changes the active node to the given id and
        // this is overridden in the controller.
    };

    PetriNetSimWidget.prototype.onBackgroundDblClick = function () {
        this._el.append('<div>Background was double-clicked!!</div>');
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    PetriNetSimWidget.prototype.destroy = function () {
        this._goBtn.off('click');
        this._startBtn.off('click');
    };

    PetriNetSimWidget.prototype.onActivate = function () {
        this._logger.debug('PetriNetSimWidget has been activated');
    };

    PetriNetSimWidget.prototype.onDeactivate = function () {
        this._logger.debug('PetriNetSimWidget has been deactivated');
    };

    return PetriNetSimWidget;
});
