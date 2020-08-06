/*!
 * Licensed under the MIT License.
 */
/* eslint-disable no-warning-comments */

import * as MRE from '@microsoft/mixed-reality-extension-sdk';
//import * as MRE from '../../mixed-reality-extension-sdk/packages/sdk/';
import App from './app';
import GrabButton from './grabbutton';
import WavPlayer from './wavplayer';
import Staff from './staff';

enum AuthType {
	Moderators=0,
	All=1,
	SpecificUser=2
  }

  interface IntervalDisplay{
	line1: MRE.Actor;
	line2: MRE.Actor;
	line3: MRE.Actor;
	text: MRE.Actor;
	note1: number;
	note2: number;
}

export default class Piano {
	public ourInteractionAuth=AuthType.All;
	public authorizedUser: MRE.User;

	//private ourKeys: MRE.Actor[] = [];
	private activeNotes: Set<number> = new Set();
	private activeIntervals: IntervalDisplay[]=[];
	private ourKeys: Map<number,MRE.Actor>=new Map(); 
	private ourNoteNames: Map<number,MRE.Actor>=new Map();
	private ourKeyColliderPositions: Map<number,MRE.Vector3>=new Map(); 

	public keyboardParent: MRE.Actor;
	public pianoGrabber: GrabButton=null;
	public ourWavPlayer: WavPlayer;
	public ourStaff: Staff;

	public keyLowest=36;
	public keyHighest=85;
	public pianoScale=5.0;
	public audioRange=50.0;

	public showNoteNames=true;
	public doSharps=true;
	public showIntervals=true;

	private inch = 0.0254;
	private halfinch = this.inch * 0.5;
	private xOffset =
		[0.0,
			0.0 + this.halfinch,
			this.inch * 1.0,
			this.inch * 1.0 + this.halfinch,
			this.inch * 2.0,
			this.inch * 3.0,
			this.inch * 3.0 + this.halfinch,
			this.inch * 4.0,
			this.inch * 4.0 + this.halfinch,
			this.inch * 5.0,
			this.inch * 5.0 + this.halfinch,
			this.inch * 6.0];
	private yOffset =
		[0, this.halfinch, 0, this.halfinch, 0, 0, this.halfinch, 0, this.halfinch, 0, this.halfinch, 0];
	private zOffset =
		[0, this.inch - 0.001, 0, this.inch - 0.001, 0, 0, this.inch - 0.001, 0, this.inch - 0.001, 0, 
			this.inch - 0.001, 0];
	private zOffsetCollision =
		[-this.inch * 1.75, this.inch, -this.inch * 1.75, this.inch, -this.inch * 1.75,
			-this.inch * 1.75, this.inch, -this.inch * 1.75, this.inch, -this.inch * 1.75,
			this.inch, -this.inch * 1.75];
	private octaveSize = this.inch * 7.0;

	private noteNamesFlats =
		["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
	private noteNamesSharps =
		["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

	private intervalNames = ["P1","m2","M2","m3","M3","P4","A4","P5","m6","M6","m7","M7","P8"];

	private whiteKeyMaterial: MRE.Material = null;
	private blackKeyMaterial: MRE.Material = null;
	private redKeyMaterial: MRE.Material= null;

	private keyLocations: Map<number,MRE.Vector3>=new Map();

	public setScale(scale: number){
		this.pianoScale=scale;
		this.keyboardParent.transform.local.scale=new MRE.Vector3(this.pianoScale, this.pianoScale, this.pianoScale);
		this.updateKeyboardCenter();
	}

	public updateKeyboardCenter(){
		const highPos=this.computeKeyPositionX(this.keyHighest)*this.pianoScale;

		const offset=-highPos-0.5;

		this.keyboardParent.transform.local.position.x=offset;
	}

	public setProperKeyColor(midiNote: number) {
		const note = midiNote % 12;

		let matt = this.blackKeyMaterial;

		if (this.zOffset[note] === 0) {
			matt = this.whiteKeyMaterial;
		}

		this.ourKeys.get(midiNote).appearance.material = matt;
	}

	public setFancyKeyColor(midiNote: number) {
		const note = midiNote % 12;

		if (this.ourStaff) {
			const materialID = this.ourStaff.noteMaterials[note].id;
			if (this.ourKeys.has(midiNote)) {
				this.ourKeys.get(midiNote).appearance.materialId = materialID;
			}
		}
	}

	constructor(private ourApp: App) {
		this.whiteKeyMaterial = this.ourApp.assets.createMaterial('cubemat', {
			color: new MRE.Color4(1, 1, 1)
		});
		this.blackKeyMaterial = this.ourApp.assets.createMaterial('cubemat', {
			color: new MRE.Color4(0, 0, 0)
		});
	}

	private isAuthorized(user: MRE.User): boolean{
		if(this.ourInteractionAuth===AuthType.All){
			return true;
		}
		if(this.ourInteractionAuth===AuthType.Moderators){
			return this.ourApp.ourUsers.isAuthorized(user);
		}
		if(this.ourInteractionAuth===AuthType.SpecificUser){
			if(user===this.authorizedUser){
				return true;
			}
		}

		return false;
	}

	public destroyKeys(){
		for(const keyActor of this.ourKeys.values()){
			keyActor.destroy();
		}
		this.ourKeys.clear();
		this.keyLocations.clear();

		this.keyboardParent.destroy();
		//this.pianoGrabber.destroy();
	}

	private computeKeyPositionX(i: number): number{
		const totalOctaves=Math.ceil((this.keyHighest-this.keyLowest)/12.0);
		const baseOctave=Math.floor(this.keyLowest / 12);
		const octave = Math.floor(i / 12);
		const relativeOctave=octave-baseOctave;
		const note = i % 12;

		return -this.octaveSize * totalOctaves + relativeOctave * this.octaveSize + this.xOffset[note];
	}

	public async createAllKeys(pos: MRE.Vector3,rot=new MRE.Quaternion()) {
		const whiteKeyMesh = this.ourApp.assets.createBoxMesh('box', this.inch * 0.9, this.inch, this.inch * 5.5);
		await whiteKeyMesh.created;
		const whiteKeyCollisionMesh = this.ourApp.assets.createBoxMesh('box', this.inch * 0.9, 
			this.inch, this.inch * 2.0);
		await whiteKeyCollisionMesh.created;

		const blackKeyMesh = this.ourApp.assets.createBoxMesh('box', this.halfinch, this.inch, this.inch * 3.5);
		await blackKeyMesh.created;

		const whiteKeyMaterial: MRE.Material = this.ourApp.assets.createMaterial('cubemat', {
			color: new MRE.Color4(1, 1, 1)
		});
		await whiteKeyMaterial.created;


		const blackKeyMaterial: MRE.Material = this.ourApp.assets.createMaterial('cubemat', {
			color: new MRE.Color4(0, 0, 0)
		});
		await blackKeyMaterial.created;

		
		if(!this.pianoGrabber){
			this.pianoGrabber=new GrabButton(this.ourApp);
			this.pianoGrabber.create(pos,rot);
		}else{
			this.pianoGrabber.setPos(pos);
			this.pianoGrabber.setRot(rot);
		}
		
		this.keyboardParent = MRE.Actor.Create(this.ourApp.context, {
			actor: {
				name: 'keyboard_parent',
				parentId: this.pianoGrabber.getGUID(),
				transform: {
					local: {
						position: new MRE.Vector3(-0.5, 0, 0),
						scale: new MRE.Vector3(this.pianoScale, this.pianoScale, this.pianoScale)
					}
				}
			}
		});

		this.updateKeyboardCenter();

		this.ourApp.ourConsole.logMessage(`creating new keyboard with range ${this.keyLowest} to ${this.keyHighest}`);
		//this.ourApp.ourConsole.logMessage(`octaves: ${totalOctaves}`);
		

		for (let i = this.keyLowest; i < this.keyHighest; i++) {
			let meshId: MRE.Guid = blackKeyMesh.id;
			let mattId: MRE.Guid = blackKeyMaterial.id;
			const note = i % 12;
			//const octave = Math.floor(i / 12);

			let collisionMeshID: MRE.Guid = blackKeyMesh.id;

			if (this.zOffset[note] === 0) {
				meshId = whiteKeyMesh.id;
				mattId = whiteKeyMaterial.id;
				collisionMeshID=whiteKeyCollisionMesh.id;
			}

			const keyPos = new MRE.Vector3(
				this.computeKeyPositionX(i), 
				this.yOffset[note],
				this.zOffset[note]);

			this.keyLocations.set(note,keyPos); //TODO, not accurate if moved (need extra calcs to get in world space)

			const keyPosCollision = keyPos.clone();
			keyPosCollision.z=this.zOffsetCollision[note]; //different zPos

			const keyActor = MRE.Actor.Create(this.ourApp.context, {
				actor: {
					name: 'PianoKey' + i,
					parentId: this.keyboardParent.id,
					transform: {
						local: { position: keyPos }
					},
					appearance:
					{
						meshId: meshId,
						materialId: mattId 
					},
				}
			});

			await keyActor.created();

			const keyCollisionActor = MRE.Actor.Create(this.ourApp.context, {
				actor: {
					name: 'CollisionPianoKey' + i,
					parentId: this.keyboardParent.id,
					transform: {
						local: { position: keyPosCollision }
					},
					appearance:
					{
						meshId: collisionMeshID,
						materialId: this.ourApp.redMat.id,
						enabled: false
					},
					collider: {
						geometry: {
							shape: MRE.ColliderType.Box
						},
						isTrigger: true
					}
				}
			});

			this.ourKeyColliderPositions.set(i,keyPosCollision);

			keyCollisionActor.collider.onTrigger("trigger-enter", (otherActor: MRE.Actor) => {
				this.ourApp.ourConsole.logMessage("trigger enter on piano note!");

				if (otherActor.name.includes('SpawnerUserHand')) { //bubble touches hand
					const guid = otherActor.name.substr(16);
					//this.ourApp.ourConsole.logMessage("  full user name is: " + otherActor.name);
					//this.ourApp.ourConsole.logMessage("  guid is: " + guid);

					if (this.ourInteractionAuth === AuthType.All || this.ourApp.ourUsers.isAuthorizedString(guid)) {
						this.keyPressed(i,127);

						if (this.ourStaff) {
							this.ourStaff.receiveNote(i, 127);
						}
					}

				} else {
					//this.ourApp.ourConsole.logMessage("sphere collided with: " + otherActor.name);
				}
			});

			keyCollisionActor.collider.onTrigger("trigger-exit", (otherActor: MRE.Actor) => {
				this.ourApp.ourConsole.logMessage("trigger enter on piano note!");

				if (otherActor.name.includes('SpawnerUserHand')) { //bubble touches hand
					const guid = otherActor.name.substr(16);
					//this.ourApp.ourConsole.logMessage("  full user name is: " + otherActor.name);
					//this.ourApp.ourConsole.logMessage("  guid is: " + guid);

					if (this.ourInteractionAuth === AuthType.All || this.ourApp.ourUsers.isAuthorizedString(guid)) {
						this.keyReleased(i);
					}

				} else {
					//this.ourApp.ourConsole.logMessage("sphere collided with: " + otherActor.name);
				}
			});

			const buttonBehavior = keyCollisionActor.setBehavior(MRE.ButtonBehavior);
			buttonBehavior.onButton("pressed", (user: MRE.User, buttonData: MRE.ButtonEventData) => {
				if (this.isAuthorized(user)) { 

					this.ourApp.ourConsole.logMessage("user clicked on piano note!");
					this.keyPressed(i,127);

					if (this.ourStaff) {
						this.ourStaff.receiveNote(i, 127);
					}
				}
			});
			buttonBehavior.onButton("released", (user: MRE.User, buttonData: MRE.ButtonEventData) => {
				if (this.isAuthorized(user)) {
					this.keyReleased(i);
				}
			});
			buttonBehavior.onHover("exit", (user: MRE.User, buttonData: MRE.ButtonEventData) => {
				if (this.isAuthorized(user)) {
					this.keyReleased(i);
				}
			});

			await keyCollisionActor.created();

			this.ourKeys.set(i,keyActor);
		}
	}
	
	public drawInterval(ourInterval: IntervalDisplay, intervalName: string){
		const notePosition1=this.ourKeyColliderPositions.get(ourInterval.note1).clone();
		const notePosition2=this.ourKeyColliderPositions.get(ourInterval.note2).clone();
		notePosition1.z+=0.02; //so we dont cover the note name
		notePosition2.z+=0.02;
		
		notePosition1.y-=0.01;
		notePosition2.y-=0.01;
		notePosition1.y+=this.halfinch;
		notePosition2.y+=this.halfinch;

		const halfwayPoint=(notePosition2.subtract(notePosition1)).multiplyByFloats(0.5,0.5,0.5).add(notePosition1);

		halfwayPoint.y+=0.06;

		/*if (noteName.includes("#") || noteName.includes("b")) {
			notePosition.x += 0.008;
		} else {
			notePosition.x += 0.016;
		}*/

		const intervalTextActor = MRE.Actor.Create(this.ourApp.context, {
			actor: {
				name: 'noteName',
				parentId: this.keyboardParent.id,
				transform: {
					local: {
						position: halfwayPoint,
						scale: new MRE.Vector3(this.pianoScale,this.pianoScale,this.pianoScale)
						//rotation: MRE.Quaternion.FromEulerAngles(90 * Math.PI / 180, 0, 0)
					}
				},
				text: {
					contents: intervalName,
					color: { r: 0.25, g: 0.25, b: 0.25 },
					anchor: MRE.TextAnchorLocation.MiddleCenter,
					height: 0.005
				}
			}
		}); 

		halfwayPoint.y-=0.01;


		const halfwayPoint1=(halfwayPoint.subtract(notePosition1)).multiplyByFloats(0.5,0.5,0.5).add(notePosition1);
		const distance1=(halfwayPoint.subtract(notePosition1)).length();

		const arrowActor1 = MRE.Actor.Create(this.ourApp.context, {
			actor: {
				parentId: this.keyboardParent.id,
				name: "arrow",
				appearance: {
					meshId: this.ourApp.boxMesh.id,
					materialId: this.ourApp.grayMat.id,
					enabled: true
				},
				transform: {
					local: {
						position: halfwayPoint1,
						rotation: MRE.Quaternion.LookAt(notePosition1,halfwayPoint),
						scale: new MRE.Vector3(0.001,0.001,distance1)
					}
				}
			}
		});

		const halfwayPoint2=(notePosition2.subtract(halfwayPoint)).multiplyByFloats(0.5,0.5,0.5).add(halfwayPoint);
		const distance2=(halfwayPoint.subtract(notePosition2)).length();


		const arrowActor2 = MRE.Actor.Create(this.ourApp.context, {
			actor: {
				parentId: this.keyboardParent.id,
				name: "arrow",
				appearance: {
					meshId: this.ourApp.boxMesh.id,
					materialId: this.ourApp.grayMat.id,
					enabled: true
				},
				transform: {
					local: {
						position: halfwayPoint2,
						rotation: MRE.Quaternion.LookAt(notePosition2,halfwayPoint),
						scale: new MRE.Vector3(0.001,0.001,distance2)
					}
				}
			}
		});

		ourInterval.text=intervalTextActor;
		ourInterval.line1=arrowActor1;	
		ourInterval.line2=arrowActor2;

	}


	public keyPressed(note: number, vel: number) {
		if(!this.ourKeys.has(note)){
			return;
		}

		const currentPos = this.ourKeys.get(note).transform.local.position;

		this.ourKeys.get(note).transform.local.position =
			new MRE.Vector3(currentPos.x, currentPos.y - 0.01, currentPos.z);
			
		if(this.ourWavPlayer){
			this.ourWavPlayer.playSound(note,vel,new MRE.Vector3(0,0,0));
		}

		this.setFancyKeyColor(note);

		if(this.showNoteNames){
			const noteNum = note % 12;
			let noteName="";

			let doSharpsComputed=this.doSharps;
			if(this.ourStaff){
				doSharpsComputed=this.ourStaff.doSharps;
			}

			if(doSharpsComputed){
				noteName=this.noteNamesSharps[noteNum];
			} else{
				noteName=this.noteNamesFlats[noteNum];
			}

			const notePosition=this.ourKeyColliderPositions.get(note).clone();
			notePosition.y-= 0.01;
			notePosition.y+=this.halfinch;
			notePosition.y+= 0.001;

			if (noteName.includes("#") || noteName.includes("b")) {
				notePosition.x += 0.008;
			} else {
				notePosition.x += 0.016;
			}

			this.ourApp.ourConsole.logMessage("Creating note name: " + noteName + " at pos: " + notePosition);

			const noteNameActor = MRE.Actor.Create(this.ourApp.context, {
				actor: {
					name: 'noteName',
					parentId: this.keyboardParent.id,
					transform: {
						local: {
							position: notePosition,
							scale: new MRE.Vector3(this.pianoScale,this.pianoScale,this.pianoScale),
							rotation: MRE.Quaternion.FromEulerAngles(90 * Math.PI / 180, 0, 0)
						}
					},
					text: {
						contents: noteName,
						color: { r: 0.25, g: 0.25, b: 0.25 },
						anchor: MRE.TextAnchorLocation.MiddleCenter,
						height: 0.005
					}
				}
			});

			if(this.ourNoteNames.has(note)){ //on the off chance was already created and not destroyed
				this.ourNoteNames.get(note).destroy();
			}
			this.ourNoteNames.set(note,noteNameActor);
		}	

		if (!this.activeNotes.has(note)) {

			if (this.showIntervals) {
				if (this.activeNotes.size > 0) {
					let lowestNote = this.activeNotes.values().next().value;
					let highestNote = lowestNote;

					for (const otherNote of this.activeNotes) {
						if (otherNote !== note) {
							if (otherNote < lowestNote) {
								lowestNote = otherNote;
							}
							if (otherNote > highestNote) {
								highestNote = otherNote;
							}
						}
					}

					if (note < lowestNote || note > highestNote) {
						let note1 = 0;
						let note2 = 0;

						if (note < lowestNote) {
							note1 = note;
							note2 = lowestNote;
						}
						if (note > highestNote) {
							note1 = highestNote;
							note2 = note;
						}

						let noteDistance = note2 - note1;
						this.ourApp.ourConsole.logMessage("computed note distance: " + noteDistance);
						while(noteDistance>12){
							noteDistance-=12;
						}
						if (noteDistance < 13) {
							const intervalName = this.intervalNames[noteDistance];

							const ourInterval = {
								line1: null as MRE.Actor,
								line2: null as MRE.Actor,
								line3: null as MRE.Actor,
								text: null as MRE.Actor,
								note1: note1,
								note2: note2
							};

							this.ourApp.ourConsole.logMessage("interval name is: " + intervalName);
							this.drawInterval(ourInterval,intervalName);

							this.activeIntervals.push(ourInterval);
						}

					} else {
						this.ourApp.ourConsole.logMessage(
							"note is in the middle of existing notes - need to get fancy!");
					}
				}				
			}
			this.activeNotes.add(note);
			//this.ourApp.ourMidiSender.send(`[144,${note},${vel}]`)

		}
	}

	public keyReleased(note: number) {
		if(!this.ourKeys.has(note)){
			return;
		}
		if(!this.activeNotes.has(note)){
			return;
		}

		const noteNum = note % 12;

		const currentPos = this.ourKeys.get(note).transform.local.position;

		this.ourKeys.get(note).transform.local.position =
			new MRE.Vector3(currentPos.x, this.yOffset[noteNum], currentPos.z);

		if(this.ourWavPlayer){
			this.ourWavPlayer.stopSound(note);
		}	

		if(this.ourNoteNames.has(note)){
			const noteName=this.ourNoteNames.get(note);
			noteName.destroy();
		}
		
		//this.ourApp.ourMidiSender.send(`[128,${note},0]`)
		this.activeNotes.delete(note);
		this.setProperKeyColor(note);

		if (this.showIntervals) {
			const intervalsToDelete: IntervalDisplay[] = [];

			for (const singleInterval of this.activeIntervals) {
				if (singleInterval.note1 === note || singleInterval.note2 === note) {
					if (singleInterval.line1) {
						singleInterval.line1.destroy();
					}
					if (singleInterval.line2) {
						singleInterval.line2.destroy();
					}
					if (singleInterval.line3) {
						singleInterval.line3.destroy();
					}
					if (singleInterval.text) {
						singleInterval.text.destroy();
					}

					intervalsToDelete.push(singleInterval);
				}
			}

			for (const singleInterval of intervalsToDelete) {
				const index = this.activeIntervals.indexOf(singleInterval);
				this.activeIntervals.splice(index, 1);
			}
		}
	}
}
