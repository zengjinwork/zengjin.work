import{e as $,r as f,ao as y,c as z,o as N,m as e,k as x,P as i,R as c,u as o,$ as T,cR as B,a0 as D,Z as M,Q as U,y as j,aW as F,aX as E,bv as L,X as O,a2 as X,cb as H}from"./index-BD1jhcBx.js";import{T as I}from"./TableModel-CHeoICCS.js";import Q from"./班级管理_form-Btr6FYc2.js";import{L as W}from"./index-D_U7czSH.js";import{P as Z,D as q}from"./TableModel.vue_vue_type_style_index_0_scoped_d88b8016_lang-DRGrestJ.js";import"./index-BOWlTVUr.js";import"./_baseDifference-CZJXe0TR.js";import"./index-CYVhYBjb.js";import"./dep-0907959d-t5hgVRcT.js";import"./pick-ropOwnIH.js";import"./index-Cpz-EqW9.js";import"./index-COUuuR9V.js";import"./index-DmoiRoTA.js";import"./dep-c171b67b-Dc6HHlFy.js";import"./index-D8BtB0WS.js";import"./dep-fe7c938f-C3xyq_Dn.js";import"./index-Bh2LcAY0.js";import"./index-BTwRdIKT.js";const gt={__name:"班级管理连选",setup(A){$(()=>{d()});const m=f({}),a=f({data:[],rowKey:"id",rowName:"name",columns:[{ellipsis:!0,width:160,title:"班级名称",colKey:"name"},{ellipsis:!0,width:120,title:"班主任",colKey:"leader"},{ellipsis:!0,width:300,title:"班级口号",colKey:"slogan"},{ellipsis:!0,width:160,title:"创建时间",colKey:"createtime"},{ellipsis:!0,width:140,title:"操作",colKey:"actions",align:"center",fixed:"right"}],pagination:{current:1,pageSize:20,total:0},onPageChange(n,t){a.pagination.current=n.current,a.pagination.pageSize=n.pageSize,u()},defaultSelectedRowKeys:[],onSelectChange(n,t){a.defaultSelectedRowKeys=n},activeRowType:"multiple"});function d(){a.pagination.current=1,u()}function h(){Object.keys(m).forEach(n=>delete m[n]),a.pagination.current=1,u()}function u(){y.get("/api/zone/mzl/class/select",{...m,current:a.pagination.current,pageSize:a.pagination.pageSize}).then(n=>{a.data=n.data||[],a.pagination.total=n.total||0})}f({});const b={row:{},action:"",dialog:!1,dialog_detail:!1,submitCallback(n){l.action==="insert"?d():u(),Object.assign(l,b)}},l=f({...b});function v(){l.row={},l.action="insert",l.dialog=!0}function C(n){l.row=n,l.action="update",l.dialog=!0}function K(n){l.row=n,l.action="detail",l.dialog=!0}function k(n){y.post("/api/zone/mzl/class/delete",{id:n.id}).then(t=>{X.success(t.msg),d()})}function R(){const n=H.confirm({header:`确定删除这${a.defaultSelectedRowKeys.length>1?a.defaultSelectedRowKeys.length:""}条数据？`,body:"请谨慎操作",confirmBtn:{theme:"danger"},onConfirm:({e:t})=>{n.hide(),k({id:a.defaultSelectedRowKeys.join(",")})}})}return(n,t)=>{const _=M,s=D,S=q,p=U,P=T,g=W,V=Z;return N(),z(O,null,[e(I,j(o(a),{show_checkbox:!1}),{TableModelHeader:i(()=>[e(P,{ref:"formRef",data:o(m),layout:"inline",colon:"",onKeypress:B(d,["enter"])},{default:i(()=>[e(s,{label:"班级名称"},{default:i(()=>[e(_,{modelValue:o(m).name,"onUpdate:modelValue":t[0]||(t[0]=r=>o(m).name=r),clearable:""},null,8,["modelValue"])]),_:1}),e(s,{label:"班主任"},{default:i(()=>[e(_,{modelValue:o(m).leader,"onUpdate:modelValue":t[1]||(t[1]=r=>o(m).leader=r),clearable:""},null,8,["modelValue"])]),_:1}),e(s,{label:"建档日期"},{default:i(()=>[e(S,{modelValue:o(m).createtime,"onUpdate:modelValue":t[2]||(t[2]=r=>o(m).createtime=r),clearable:""},null,8,["modelValue"])]),_:1}),e(s,null,{default:i(()=>[e(p,{onClick:d},{default:i(()=>[...t[4]||(t[4]=[c("查询",-1)])]),_:1}),e(p,{theme:"default",variant:"outline",onClick:h},{default:i(()=>[...t[5]||(t[5]=[c("重置",-1)])]),_:1})]),_:1}),e(s,{toright:""},{default:i(()=>[e(p,{theme:"primary",onClick:v},{default:i(()=>[...t[6]||(t[6]=[c("新增",-1)])]),_:1}),e(p,{theme:"danger",onClick:R,disabled:!o(a).defaultSelectedRowKeys.length},{default:i(()=>[...t[7]||(t[7]=[c("删除",-1)])]),_:1},8,["disabled"])]),_:1})]),_:1},8,["data"])]),actions:i(({row:r})=>[e(g,{theme:"primary",onClick:w=>K(r)},{default:i(()=>[...t[8]||(t[8]=[c("详情",-1)])]),_:1},8,["onClick"]),e(g,{theme:"warning",onClick:w=>C(r)},{default:i(()=>[...t[9]||(t[9]=[c("编辑",-1)])]),_:1},8,["onClick"]),e(V,{theme:"danger",content:`确定删除【${r[o(a).rowName]}】？`,onConfirm:w=>k(r)},{default:i(()=>[e(g,{theme:"danger"},{default:i(()=>[...t[10]||(t[10]=[c("删除",-1)])]),_:1})]),_:1},8,["content","onConfirm"])]),_:1},16),x(` <t-form ref="formRef" :data="form" layout="inline" colon @keypress.enter="click_select">\r
		<t-form-item label="班级名称">\r
			<t-input v-model="form.name" clearable />\r
		</t-form-item>\r
		<t-form-item label="班主任">\r
			<t-input v-model="form.leader" clearable />\r
		</t-form-item>\r
		<t-form-item label="建档日期">\r
			<t-date-picker v-model="form.createtime" clearable />\r
		</t-form-item>\r
		<t-form-item>\r
			<t-button @click="click_select">查询</t-button>\r
			<t-button theme="default" variant="outline" @click="click_reset">重置</t-button>\r
		</t-form-item>\r
		<t-form-item toright>\r
			<t-button theme="primary" @click="click_insert">新增</t-button>\r
			<t-button theme="danger" @click="click_deletes" :disabled="!table.defaultSelectedRowKeys.length">删除</t-button>\r
		</t-form-item>\r
	</t-form>\r
\r
	<t-table\r
		:data="table.data"\r
		:columns="table.columns"\r
		:pagination="table.pagination"\r
		:onPageChange="table.onPageChange"\r
		activeRowType="multiple"\r
		v-model:activeRowKeys="table.activeRowKeys">\r
		<template #actions="{ row }">\r
			<t-link theme="primary" @click="click_detail(row)">详情</t-link>\r
			<t-link theme="warning" @click="click_update(row)">编辑</t-link>\r
			<t-popconfirm theme="danger" :content="\`确定删除【\${row[table.rowName]}】？\`" @confirm="click_delete(row)">\r
				<t-link theme="danger">删除</t-link>\r
			</t-popconfirm>\r
		</template></t-table\r
	> `),e(L,{visible:o(l).dialog,"onUpdate:visible":t[3]||(t[3]=r=>o(l).dialog=r),width:450,header:{insert:"新增",update:`${o(l).row[o(a).rowName]} - 编辑`,detail:`${o(l).row[o(a).rowName]} - 详情`}[o(l).action]},{default:i(()=>[e(Q,F(E(o(l))),null,16)]),_:1},8,["visible","header"])],64)}}};export{gt as default};
