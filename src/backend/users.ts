/*!
 * Licensed under the MIT License.
 */

import * as MRE from '../../../mixed-reality-extension-sdk/packages/sdk/';
//import * as MRE from '../../mixed-reality-extension-sdk/packages/sdk/';

import Button from '../gui/button';
import App from '../app';

/**
 * The main class of this app. All the logic goes here.
 */

interface UserProperties {
	name: string;
	user: MRE.User;
	userID: MRE.Guid;
	lHand: MRE.Actor;
	rHand: MRE.Actor;
	isModerator: boolean;
	chest: MRE.Actor;
}

export default class Users {

	public allUsers: UserProperties[] = [];
	public allElevatedUsers: UserProperties[]=[];

	public elevatedUsers: string[] = [];
	public doFreePlay=false;

	constructor(private ourApp: App) {

	}

	/*public getUserChest(userID: MRE.Guid): MRE.Actor {
		for (const oneUser of this.allUsers) {
			if (oneUser.userID === userID) {
				if (oneUser.chest) {
					return oneUser.chest;
				}
			}
		}
		return null;
	}*/

	public getUserPos(userID: MRE.Guid): MRE.Vector3 {
		for (const oneUser of this.allUsers) {
			if (oneUser.userID === userID) {
				if (oneUser.rHand && oneUser.lHand) {
					const rPos = oneUser.rHand.transform.app.position;
					const lPos = oneUser.lHand.transform.app.position;

					const avgPos = (rPos.add(lPos)).multiplyByFloats(0.5, 0.5, 0.5);
					return avgPos;
				}
			}
		}
		return MRE.Vector3.Zero();
	}

	public showHands() {
		for (const user of this.allUsers) {
			if (user.lHand) {
				user.lHand.appearance.enabled = true;
			}
			if (user.rHand) {
				user.rHand.appearance.enabled = true;
			}
		}
	}

	public isAuthorized(user: MRE.User): boolean {
		if(this.doFreePlay){
			return true;
		}

		const ourRoles = user.properties["altspacevr-roles"];

		if (ourRoles.includes("moderator") || ourRoles.includes("presenter") ||
			ourRoles.includes("terraformer")) {
			return true;
		}

		return false;
	}

	public isAuthorizedString(user: string): boolean {
		if(this.doFreePlay){
			return true;
		}
		
		if (this.elevatedUsers.includes(user)) {
			//this.ourConsole.logMessage("user is moderator based on GUID");
			return true;
		}

		//this.ourConsole.logMessage("user is NOT moderator based on GUID");
		return false;
	}

	public getElevatedUsersGroupMask(): MRE.GroupMask{
		return new MRE.GroupMask(this.ourApp.context, ['presenters']);
	}

	public userJoined(user: MRE.User, createHands: boolean){  //, createChest: boolean) {
		this.ourApp.ourConsole.logMessage("user joined. name: " + user.name + " id: " + user.id);

		let isModerator = false

		if (this.isAuthorized(user)) {
			this.ourApp.ourConsole.logMessage("  user is authorized");
			isModerator = true;
		} else{
			this.ourApp.ourConsole.logMessage("  user is NOT authorized");
		}

		const rHand: MRE.Actor = null;
		const lHand: MRE.Actor = null;
		const chest: MRE.Actor = null;

		const ourUser = {
			name: user.name,
			user: user,
			userID: user.id,
			authButton: null as Button,
			handButton: null as Button,
			rHand: rHand,
			lHand: lHand,
			isModerator: isModerator,
			chest: chest
		}
		this.allUsers.push(ourUser);	
		this.ourApp.ourConsole.logMessage("  user array is now size: " + this.allUsers.length);
	

		if(createHands){
			this.addHands(ourUser).then( ()=> {
				this.ourApp.ourConsole.logMessage("  all hands created for: " + ourUser.name);
			});
		}
		//if(createChest){
		//	this.addChest(ourUser);
		//}

		if (isModerator) {
			this.elevatedUsers.push(user.id.toString());
			user.groups.add('presenters');

			this.allElevatedUsers.push(ourUser);
			this.ourApp.ourConsole.logMessage("  elevated user array is now size: " + this.allElevatedUsers.length);
		}
	}

	public findUserRecord(userID: MRE.Guid): UserProperties {
		for (let i = 0; i < this.allUsers.length; i++) {
			const ourUser = this.allUsers[i];
			if (ourUser.userID === userID) {
				return ourUser;
			}
		}

		this.ourApp.ourConsole.logMessage("ERROR: can't find userID: " + userID);
		return null;
	}	

	public removeElevatedUser(user: MRE.User){
		for (let i = 0; i < this.allElevatedUsers.length; i++) {
			const ourUser = this.allElevatedUsers[i];

			if (ourUser.userID === user.id) {				
				this.allElevatedUsers.splice(i, 1);
				this.ourApp.ourConsole.logMessage("removed user from elevated users listlist");

				break;
			}
		}
		this.ourApp.ourConsole.logMessage("  elevated user array is now size: " + this.allElevatedUsers.length);

	}
	
	public userLeft(user: MRE.User) {
		this.ourApp.ourConsole.logMessage("user left. name: " + user.name + " id: " + user.id);

		for (let i = 0; i < this.allUsers.length; i++) {
			const ourUser = this.allUsers[i];

			if (ourUser.userID === user.id) {				
				this.allUsers.splice(i, 1);

				if (ourUser.isModerator) {
					const userString = user.id.toString();

					const index = this.elevatedUsers.indexOf(userString);
					if (index !== -1) {
						this.elevatedUsers.splice(index, 1);
						this.ourApp.ourConsole.logMessage("removed user from moderator string list");
					}	
					
					this.removeElevatedUser(user);
				}

				this.removeHands(ourUser.lHand, ourUser.rHand,ourUser.chest);
				break;
			}
		}

		this.ourApp.ourConsole.logMessage("  user array is now size: " + this.allUsers.length);
	}

	private async addHands(ourUser: UserProperties) {

		this.ourApp.ourConsole.logMessage("creating hands for: " + ourUser.name);

		//sometimes create user gets called before we've had a chance to setup the meshes
		while (this.ourApp.boxMesh === null) {
			this.ourApp.ourConsole.logMessage("mesh hasn't been created yet, so waiting 1 second");
			await new Promise(resolve => setTimeout(resolve, 1000));
		}

		this.ourApp.ourConsole.logMessage("Good! seems the box mesh is not null for the hands");

		await this.ourApp.boxMesh.created;

		ourUser.rHand = this.createHand('right-hand', ourUser.userID,
			//new MRE.Vector3(0, 0, 0.1),
			new MRE.Vector3(-0.03, 0.01, 0.16),
			//new MRE.Vector3(0.03, 0.03, 0.14));
			new MRE.Vector3(0.03, 0.03, 0.03));

		if(ourUser.rHand===null){
			this.ourApp.ourConsole.logMessage("ERROR: UNABLE TO CREATE RIGHT HAND FOR: " + ourUser.name);
		}
		await ourUser.rHand.created();

		this.ourApp.ourConsole.logMessage("  right hand created for: " + ourUser.name);

		ourUser.lHand = this.createHand('left-hand', ourUser.userID,
			//new MRE.Vector3(0, 0, 0.1),
			new MRE.Vector3(0.03, 0.01, 0.16),
			//new MRE.Vector3(0.03, 0.03, 0.14));
			new MRE.Vector3(0.03, 0.03, 0.03));
		await ourUser.lHand.created();

		if(ourUser.lHand===null){
			this.ourApp.ourConsole.logMessage("ERROR: UNABLE TO CREATE LEFT HAND FOR: " + ourUser.name);
		}

		this.ourApp.ourConsole.logMessage("  left hand created for: " + ourUser.name);
	}

	/*private addChest(ourUser: UserProperties) {
		setTimeout(() => {
			this.ourApp.ourConsole.logMessage("creating chest for: " + ourUser.name);

			ourUser.chest = MRE.Actor.Create(this.ourApp.context, {
				actor: {
					name: 'chest' + ourUser.toString(),
					transform: {
						local: {
							position: new MRE.Vector3(0, -0.25, 0.0),
							scale: MRE.Vector3.One()
						}
					},
					attachment: {
						attachPoint: "head",
						userId: ourUser.userID
					},
					appearance:
					{
						meshId: this.ourApp.boxMesh.id,
						enabled: false
					},
					subscriptions: ['transform']
				}
			});
		}, 1000);
	}*/


	private createHand(aPoint: string, userID: MRE.Guid, handPos: MRE.Vector3, handScale: MRE.Vector3) {
		const hand = MRE.Actor.Create(this.ourApp.context, {
			actor: {
				name: 'SpawnerUserHand_' + userID.toString(),
				transform: {
					local: {
						position: handPos,
						scale: handScale
					}
				},
				attachment: {
					attachPoint: aPoint as MRE.AttachPoint,
					userId: userID
				},
				appearance:
				{
					meshId: this.ourApp.boxMesh.id,
					enabled: false
				},
				subscriptions: ['transform']
				/*collider: {
					geometry: {
						shape: MRE.ColliderType.Box
					},
					isTrigger: false
				},
				rigidBody: {
					enabled: true,
					isKinematic: true
				}*/

			}
		});

		//hand.subscribe('transform');
		//hand.subscribe('rigidbody');
		//hand.subscribe('collider');

		return hand;
	}	

	private removeHands(leftHand: MRE.Actor, rightHand: MRE.Actor, chest: MRE.Actor) {
		if (leftHand) {
			//leftHand.rigidBody.enabled=false;
			//leftHand.collider.enabled=false;
			//leftHand.detach();
			//leftHand.destroy(); //causes errors!
		}
		if (rightHand) {
			//rightHand.rigidBody.enabled=false;
			//rightHand.collider.enabled=false;
			//rightHand.detach();
			//rightHand.destroy(); //causes errors!
		}
		if(chest){
			//chest.destroy();
		}
	}
}
